import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, RuleError } from '../game/engine';
import { viewForPlayer } from '../game/views';
import type { GameCommand, GameState, GameView, VisibleCard } from '../game/types';
import { LocalSession } from '../session/local';
import { actionUnavailableReason, allocationLimit, canConfirmEffect, decisionCandidates, effectCommand, effectSource, effectUnavailableReason, emptyDraft, updateDraft } from './interaction';
import type { CardAction, TableDraft } from './interaction';

function attempt(state: GameState, command: GameCommand): GameState | undefined {
  try { return applyCommand(state, state.decisionPlayer, command); }
  catch (error) { if (error instanceof RuleError) return undefined; throw error; }
}

/** Reach effect commands through the same candidate/draft steps available by tapping. */
function effectDrafts(view: GameView): TableDraft[] {
  const first = decisionCandidates(view, emptyDraft());
  const source = effectSource(view)!;
  if (source.def === 'sake') {
    const drafts: TableDraft[] = [];
    function allocate(index: number, draft: TableDraft) {
      if (index === first.cards.length) { drafts.push(draft); return; }
      const id = first.cards[index].id;
      const limit = allocationLimit(view, draft, id);
      for (let count = 0; count <= limit; count++) allocate(index + 1, updateDraft(draft, { type: 'setAllocation', id, count }));
    }
    allocate(0, emptyDraft());
    return drafts;
  }
  if (source.def === 'ougi') return first.cards.flatMap(from => {
    const draft = updateDraft(emptyDraft(), { type: 'toggleTarget', id: from.id, maximum: 2, ordered: true });
    return decisionCandidates(view, draft).cards.filter(to => to.id !== from.id).map(to => updateDraft(draft, { type: 'toggleTarget', id: to.id, maximum: 2, ordered: true }));
  });
  const ids = [...first.cards.map(card => card.id), ...first.hiddenTrapSeats.map(seat => `trap:${seat}`)];
  const drafts = ids.map(id => updateDraft(emptyDraft(), { type: 'toggleTarget', id, maximum: first.maximum }));
  if (first.minimum === 0) drafts.push(emptyDraft());
  if (first.maximum === 2) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) drafts.push({ ...emptyDraft(), targets: [ids[i], ids[j]] });
  return drafts;
}

function cardCommands(view: GameView, card: VisibleCard): [CardAction, GameCommand][] {
  const actions: [CardAction, GameCommand][] = [];
  if (card.zone === 'hand' || card.zone === 'trap') actions.push(['play', { type: 'play', cardId: card.id }]);
  if (card.zone === 'hand' && card.definition.kind === 'spell') actions.push(['setTrap', { type: 'setTrap', cardId: card.id }]);
  if (card.zone === 'field') {
    actions.push(['evoke', { type: 'evoke', cardId: card.id }]);
    if (card.definition.effectType === 'release') actions.push(['release', { type: 'release', cardId: card.id }]);
    const enemy = view.players[view.decisionPlayer === 0 ? 1 : 0];
    for (const target of enemy.field.length ? enemy.field.map(card => card.id) : [null]) actions.push(['attack', { type: 'attack', attacker: card.id, target }]);
  }
  return actions;
}

/** Deliberately broad commands: the engine, rather than UI predicates, decides legality. */
function rawChoices(state: GameState): Extract<GameCommand, { type: 'choose' }>[] {
  if (state.pending?.kind !== 'effect') return [];
  const def = state.cards[state.pending.cardId].def;
  const field = state.players.flatMap(player => player.field);
  if (def === 'sake') {
    const result: Extract<GameCommand, { type: 'choose' }>[] = [];
    function distribute(index: number, allocations: { cardId: string; count: number }[], remaining: number) {
      if (index === field.length) { result.push({ type: 'choose', allocations }); return; }
      distribute(index + 1, allocations, remaining);
      for (let count = 1; count <= remaining; count++) distribute(index + 1, [...allocations, { cardId: field[index], count }], remaining - count);
    }
    distribute(0, [], 3);
    return result;
  }
  if (def === 'ougi') return field.flatMap(from => field.filter(to => to !== from).map(to => ({ type: 'choose' as const, targets: [from, to] })));
  const ids = def === 'boseki' ? state.players.flatMap(player => player.graveyard) : def === 'karakasa-kozo' ? state.players.flatMap(player => player.trap ? [player.trap] : []) : field;
  const result: Extract<GameCommand, { type: 'choose' }>[] = ids.map(id => ({ type: 'choose', targets: [id] }));
  if (def === 'jufu') {
    result.push({ type: 'choose', targets: [] });
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) result.push({ type: 'choose', targets: [ids[i], ids[j]] });
  }
  return result;
}

function choiceKey(state: GameState, command: Extract<GameCommand, { type: 'choose' }>): string {
  const allocations = [...(command.allocations ?? [])].sort((a, b) => a.cardId.localeCompare(b.cardId));
  const targets = (command.targets ?? []).map(id => {
    const seat = state.players.findIndex(player => player.trap === id);
    return seat < 0 ? id : `trap:${seat}`;
  });
  return JSON.stringify({ targets, allocations });
}

describe('projected interaction paths across complete games', () => {
  it('keeps enabled actions and every reachable target/allocation consistent with the engine', () => {
    const effects = new Set<string>();
    const coverage = { trapResponses: 0, hiddenTrapTargets: 0, exchangedOwner: 0, pairAllocations: 0, tripleAllocations: 0, opposingGraveyard: 0 };
    for (let seed = 200; seed < 296; seed++) {
      let state = createGame({ seed, startingPlayer: (seed % 2) as 0 | 1 });
      let random = seed;
      for (let step = 0; !state.result && step < 400; step++) {
        const view = viewForPlayer(state, state.decisionPlayer);
        const options: { command: GameCommand; next: GameState }[] = [];
        const check = (command: GameCommand, enabled: boolean, context: string) => {
          const next = attempt(state, command);
          expect(!!next, `seed ${seed}, step ${step}, ${context}, ${JSON.stringify(command)}`).toBe(enabled);
          if (next) options.push({ command, next });
        };
        if (view.phase === 'main') {
          const actor = view.players[view.decisionPlayer];
          const cards = [...actor.hand!, ...actor.field, ...(actor.trap && !('hidden' in actor.trap) ? [actor.trap] : [])];
          for (const card of cards) {
            if (card.owner !== card.controller) coverage.exchangedOwner++;
            for (const [action, command] of cardCommands(view, card)) check(command, !actionUnavailableReason(view, card, action), card.definition.name);
          }
          check({ type: 'endTurn' }, true, 'end turn');
        } else if (view.phase === 'trap') {
          coverage.trapResponses++;
          const trap = view.players[view.decisionPlayer].trap;
          expect(trap && !('hidden' in trap)).toBeTruthy();
          if (!trap || 'hidden' in trap) throw new Error('Defender cannot see their own trap');
          check({ type: 'respond', activate: true }, !effectUnavailableReason(view, trap), trap.definition.name);
          check({ type: 'respond', activate: false }, true, 'keep trap');
        } else {
          const source = effectSource(view)!;
          effects.add(source.def);
          const reachable = new Set<string>();
          for (const draft of effectDrafts(view)) {
            expect(canConfirmEffect(view, draft), `${source.def} generated an unconfirmable path`).toBe(true);
            if (Object.keys(draft.allocations).length === 2) coverage.pairAllocations++;
            if (Object.keys(draft.allocations).length === 3) coverage.tripleAllocations++;
            if (draft.targets.some(id => id.startsWith('trap:'))) coverage.hiddenTrapTargets++;
            if (source.def === 'boseki' && draft.targets.some(id => view.players[view.decisionPlayer === 0 ? 1 : 0].graveyard.some(card => card.id === id))) coverage.opposingGraveyard++;
            const command = effectCommand(view, draft);
            reachable.add(choiceKey(state, command));
            check(command, true, source.def);
          }
          const legal = new Set(rawChoices(state).filter(command => attempt(state, command)).map(command => choiceKey(state, command)));
          expect([...reachable].sort(), `UI omits a legal ${source.def} choice at seed ${seed}, step ${step}`).toEqual([...legal].sort());
        }
        expect(options.length, `seed ${seed} became stuck at ${JSON.stringify(view.pending)}`).toBeGreaterThan(0);
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        state = options[random % options.length].next;
      }
      expect(state.result, `seed ${seed} failed to finish`).not.toBeNull();
    }
    expect([...effects].sort()).toEqual(['boseki', 'hamaya', 'jufu', 'karakasa-kozo', 'nekomata', 'ougi', 'sake']);
    for (const [name, count] of Object.entries(coverage)) expect(count, `Unexercised edge: ${name}`).toBeGreaterThan(0);
  }, 60000);

  it('reloads pending decisions and undoes/replays completed effects throughout private matches', async () => {
    const phases = new Set<string>();
    for (let seed = 200; seed < 216; seed++) {
      let stored: string | null = null;
      const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
      let session = new LocalSession(storage, () => `session-${seed}`);
      let snapshot = await session.start({ seed, startingPlayer: (seed % 2) as 0 | 1 });
      let state = createGame({ seed, startingPlayer: (seed % 2) as 0 | 1 });
      let random = seed;
      let commandNumber = 0;
      for (let step = 0; !state.result && step < 400; step++) {
        const view = snapshot.view;
        phases.add(view.phase);
        expect(view).toEqual(viewForPlayer(state, state.decisionPlayer));
        if (view.phase !== 'main') {
          session = new LocalSession(storage);
          expect(await session.load()).toEqual(snapshot);
        }
        let commands: GameCommand[];
        if (view.phase === 'main') {
          const actor = view.players[view.decisionPlayer];
          const cards = [...actor.hand!, ...actor.field, ...(actor.trap && !('hidden' in actor.trap) ? [actor.trap] : [])];
          commands = cards.flatMap(card => cardCommands(view, card).filter(([action]) => !actionUnavailableReason(view, card, action)).map(([, command]) => command));
          commands.push({ type: 'endTurn' });
        } else if (view.phase === 'trap') {
          const trap = view.players[view.decisionPlayer].trap;
          commands = [{ type: 'respond', activate: false }];
          if (trap && !('hidden' in trap) && !effectUnavailableReason(view, trap)) commands.unshift({ type: 'respond', activate: true });
        } else commands = effectDrafts(view).map(draft => effectCommand(view, draft));
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const command = commands[random % commands.length];
        const before = snapshot;
        const submission = { matchId: snapshot.matchId, commandId: `command-${commandNumber++}`, expectedRevision: snapshot.revision, actor: state.decisionPlayer, command };
        const expected = applyCommand(state, state.decisionPlayer, command);
        snapshot = await session.submit(submission);
        expect(snapshot.view).toEqual(viewForPlayer(expected, expected.decisionPlayer));
        if (view.phase === 'effect' || expected.result) {
          snapshot = await session.undo(snapshot.revision);
          expect(snapshot.view).toEqual(before.view);
          session = new LocalSession(storage);
          expect(await session.load()).toEqual(snapshot);
          // Retrying a receipt from the undone branch must not reapply it.
          expect(await session.submit(submission)).toEqual(snapshot);
          snapshot = await session.submit({ ...submission, commandId: `command-${commandNumber++}`, expectedRevision: snapshot.revision });
          expect(snapshot.view).toEqual(viewForPlayer(expected, expected.decisionPlayer));
        }
        state = expected;
      }
      expect(state.result).not.toBeNull();
      phases.add(snapshot.view.phase);
      expect(await new LocalSession(storage).load()).toEqual(snapshot);
    }
    expect([...phases].sort()).toEqual(['effect', 'finished', 'main', 'trap']);
  }, 60000);
});
