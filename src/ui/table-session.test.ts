import { describe, expect, it } from 'vitest';
import type { CardDefId, GameCommand, GameState, GameView, PlayerId, VisibleCard } from '../game/types';
import { LocalSession, type SessionSnapshot, type SessionStorage } from '../session/local';
import { actionUnavailableReason, allocationLimit, canConfirmEffect, decisionCandidates, effectCommand, effectSource, effectUnavailableReason, emptyDraft, updateDraft, type TableDraft } from './interaction';

class MemoryStorage implements SessionStorage {
  value: string | null = null;
  fail = false;
  getItem() { return this.value; }
  setItem(_key: string, value: string) {
    if (this.fail) throw new Error('Storage is full');
    this.value = value;
  }
}

let commandNumber = 0;
function submit(session: LocalSession, snapshot: SessionSnapshot, command: GameCommand) {
  return session.submit({ matchId: snapshot.matchId, expectedRevision: snapshot.revision, actor: snapshot.view.decisionPlayer, commandId: `table-${++commandNumber}`, command });
}

function put(state: GameState, def: CardDefId, owner: PlayerId, zone: 'hand' | 'field' | 'graveyard' | 'trap', souls = 0) {
  const card = Object.values(state.cards).find(card => card.owner === owner && card.def === def)!;
  for (const player of state.players) {
    for (const key of ['deck', 'hand', 'field', 'graveyard'] as const) player[key] = player[key].filter(id => id !== card.id);
    if (player.trap === card.id) player.trap = null;
  }
  if (zone === 'trap') state.players[owner].trap = card.id;
  else state.players[owner][zone].push(card.id);
  state.supply += card.souls - souls;
  card.souls = souls;
  return card.id;
}

async function scenario(def: CardDefId, asTrap = false) {
  const storage = new MemoryStorage();
  const session = new LocalSession(storage, () => `table-${def}`);
  await session.start({ seed: 42, startingPlayer: 0 });
  const saved = JSON.parse(storage.value!);
  const state = saved.state as GameState;
  state.turn = asTrap ? 4 : 3;
  state.turnPlayer = asTrap ? 1 : 0;
  state.decisionPlayer = state.turnPlayer;
  state.actionsUsed = 0;
  state.supply = 11;
  for (const player of state.players) {
    player.hand = []; player.field = []; player.graveyard = []; player.trap = null;
    player.deck = Object.values(state.cards).filter(card => card.owner === state.players.indexOf(player)).map(card => card.id);
  }
  for (const card of Object.values(state.cards)) { card.souls = 0; card.summonedTurn = 0; }
  const release = def === 'karakasa-kozo' || def === 'nekomata';
  const sourceId = put(state, def, 0, release ? 'field' : asTrap ? 'trap' : 'hand', release ? 1 : 0);
  switch (def) {
    case 'sake':
      put(state, 'kappa', 0, 'field', 2); put(state, 'nekomata', 1, 'field'); put(state, 'zashiki-warashi', 1, 'field', 1); break;
    case 'jufu': case 'ougi':
      put(state, 'kappa', 0, 'field', 1); put(state, 'nekomata', 1, 'field', def === 'jufu' ? 1 : 0); put(state, 'zashiki-warashi', 1, 'field', 1); break;
    case 'boseki': put(state, 'tengu', 1, 'graveyard'); break;
    case 'hamaya':
      put(state, 'kappa', 0, 'field'); put(state, 'tengu', 1, 'field'); put(state, 'zashiki-warashi', 1, 'field', 1); break;
    case 'karakasa-kozo': put(state, 'sake', 0, 'trap'); put(state, 'jufu', 1, 'trap'); break;
    case 'nekomata': put(state, 'zashiki-warashi', 1, 'field', 1); break;
  }
  storage.value = JSON.stringify(saved);
  const snapshot = (await session.load())!;
  return { storage, session, snapshot, sourceId };
}

/** Build choices only from what the current player can see and tap. */
function effectDraft(view: GameView): TableDraft {
  let draft = emptyDraft();
  const source = effectSource(view)!;
  expect(source).toBeDefined();
  if (source.def === 'sake') {
    for (let step = 0; step < 6; step++) {
      const receiver = decisionCandidates(view, draft).cards.find(card => allocationLimit(view, draft, card.id) > (draft.allocations[card.id] ?? 0));
      if (!receiver) break;
      draft = updateDraft(draft, { type: 'setAllocation', id: receiver.id, count: allocationLimit(view, draft, receiver.id) });
    }
  } else {
    const count = source.def === 'jufu' || source.def === 'ougi' ? 2 : 1;
    for (let step = 0; step < count; step++) {
      const candidates = decisionCandidates(view, draft);
      const id = source.def === 'karakasa-kozo' && candidates.hiddenTrapSeats.length
        ? `trap:${candidates.hiddenTrapSeats[0]}`
        : candidates.cards.find(card => !draft.targets.includes(card.id))?.id;
      if (!id) break;
      draft = updateDraft(draft, { type: 'toggleTarget', id, maximum: candidates.maximum });
    }
  }
  expect(canConfirmEffect(view, draft), `No confirmable ${source.def} choice from the projected table`).toBe(true);
  return draft;
}

function visibleTrap(trap: GameView['players'][number]['trap']): trap is VisibleCard { return !!trap && !('hidden' in trap); }

describe('table decisions through LocalSession', () => {
  it.each(['sake', 'jufu', 'boseki', 'ougi', 'hamaya', 'karakasa-kozo', 'nekomata'] as const)('%s choices from the projected table resolve, undo and reload', async def => {
    const { storage, session, snapshot, sourceId } = await scenario(def);
    const source = [...(snapshot.view.players[0].hand ?? []), ...snapshot.view.players[0].field].find(card => card.id === sourceId)!;
    const action = source.definition.effectType === 'release' ? 'release' : 'play';
    expect(actionUnavailableReason(snapshot.view, source, action)).toBeUndefined();
    const pending = await submit(session, snapshot, { type: action, cardId: sourceId });
    expect(pending.view.phase).toBe('effect');
    const draft = effectDraft(pending.view);
    if (def === 'karakasa-kozo') {
      expect(pending.view.players[1].trap).toEqual({ hidden: true });
      expect(draft.targets).toEqual(['trap:1']);
    }
    const command = effectCommand(pending.view, draft);
    const resolved = await submit(session, pending, command);
    expect(resolved.view.phase).toBe('main');
    if (def === 'boseki') expect(resolved.view.players[0].field).toEqual(expect.arrayContaining([expect.objectContaining({ def: 'tengu', owner: 1, controller: 0 })]));
    if (def === 'nekomata') expect(resolved.view.players[0].field).toEqual(expect.arrayContaining([expect.objectContaining({ def: 'zashiki-warashi', owner: 1, controller: 0 })]));
    if (def === 'karakasa-kozo') expect(resolved.view.players[1].trap).toBeNull();
    const undone = await session.undo(resolved.revision);
    expect(undone.view).toEqual(pending.view);
    const reloaded = new LocalSession(storage);
    expect(await reloaded.load()).toEqual(undone);
    expect((await submit(reloaded, undone, command)).view).toEqual(resolved.view);
  });

  it('keeps the defender as decision actor through a reloaded trap allocation', async () => {
    const { storage, session, snapshot } = await scenario('sake', true);
    const attacker = snapshot.view.players[1].field.find(card => card.def === 'nekomata')!;
    const target = snapshot.view.players[0].field[0];
    const attacking = updateDraft(emptyDraft(), { type: 'beginAttack', id: attacker.id });
    expect(decisionCandidates(snapshot.view, attacking).cards).toContainEqual(target);
    const trap = await submit(session, snapshot, { type: 'attack', attacker: attacker.id, target: target.id });
    expect(trap.view).toMatchObject({ phase: 'trap', turnPlayer: 1, decisionPlayer: 0 });
    expect(trap.view.players[1].hand).toBeNull();
    const reloaded = new LocalSession(storage);
    expect(await reloaded.load()).toEqual(trap);
    const pending = await submit(reloaded, trap, { type: 'respond', activate: true });
    expect(pending.view).toMatchObject({ phase: 'effect', turnPlayer: 1, decisionPlayer: 0 });
    const draft = effectDraft(pending.view);
    const resolved = await submit(reloaded, pending, effectCommand(pending.view, draft));
    expect(resolved.view).toMatchObject({ phase: 'turnEnd', turnPlayer: 1, decisionPlayer: 0 });
    expect((await reloaded.undo(resolved.revision)).view).toEqual(pending.view);
  });

  it('keeps the accepted revision and allocation recoverable after a storage rejection', async () => {
    const { storage, session, snapshot, sourceId } = await scenario('sake');
    const pending = await submit(session, snapshot, { type: 'play', cardId: sourceId });
    const draft = effectDraft(pending.view);
    const before = storage.value;
    const command = effectCommand(pending.view, draft);
    storage.fail = true;
    await expect(submit(session, pending, command)).rejects.toThrow(/save|storage/i);
    expect(await session.getSnapshot()).toEqual(pending);
    expect(storage.value).toBe(before);
    expect(canConfirmEffect(pending.view, draft)).toBe(true);
    storage.fail = false;
    const accepted = await submit(session, pending, command);
    expect(accepted.revision).toBe(pending.revision + 1);
    expect(accepted.view.phase).toBe('main');
  });

  it('casts the immediate draw spell without introducing a target draft', async () => {
    const { session, snapshot, sourceId } = await scenario('kozuchi');
    const count = snapshot.view.players[0].handCount;
    const next = await submit(session, snapshot, { type: 'play', cardId: sourceId });
    expect(next.view).toMatchObject({ phase: 'main', actionsUsed: 1, pending: null });
    expect(next.view.players[0].handCount).toBe(count + 1);
  });
});

function mainCommands(view: GameView): GameCommand[] {
  const actor = view.players[view.decisionPlayer], opponent = view.players[view.decisionPlayer === 0 ? 1 : 0];
  if (view.phase === 'turnEnd') return [{ type: 'endTurn' }];
  const commands: GameCommand[] = [];
  for (const card of [...(actor.hand ?? []), ...(visibleTrap(actor.trap) ? [actor.trap] : [])]) {
    if (!actionUnavailableReason(view, card, 'play')) commands.push({ type: 'play', cardId: card.id });
    if (card.zone === 'hand' && card.definition.kind === 'spell' && !actionUnavailableReason(view, card, 'setTrap')) commands.push({ type: 'setTrap', cardId: card.id });
  }
  for (const card of actor.field) {
    if (!actionUnavailableReason(view, card, 'evoke')) commands.push({ type: 'evoke', cardId: card.id });
    if (card.definition.effectType === 'release' && !actionUnavailableReason(view, card, 'release')) commands.push({ type: 'release', cardId: card.id });
    if (!actionUnavailableReason(view, card, 'attack')) {
      const draft = updateDraft(emptyDraft(), { type: 'beginAttack', id: card.id });
      if (!opponent.field.length) commands.push({ type: 'attack', attacker: card.id, target: null });
      else for (const target of decisionCandidates(view, draft).cards) commands.push({ type: 'attack', attacker: card.id, target: target.id });
    }
  }
  return [...commands, { type: 'endTurn' }];
}

describe('complete matches using projected table choices', () => {
  it.each([3, 19, 42])('finishes seed %i without canonical rejection', async seed => {
    const storage = new MemoryStorage();
    let session = new LocalSession(storage, () => `projected-${seed}`);
    let snapshot = await session.start({ seed, startingPlayer: 0 });
    let random = seed;
    for (let step = 0; !snapshot.view.result && step < 400; step++) {
      const view = snapshot.view;
      expect(view.players[view.decisionPlayer].hand).not.toBeNull();
      expect(view.players[view.decisionPlayer === 0 ? 1 : 0].hand).toBeNull();
      let command: GameCommand;
      if (view.phase === 'effect') command = effectCommand(view, effectDraft(view));
      else if (view.phase === 'trap') {
        const trap = view.players[view.decisionPlayer].trap;
        command = { type: 'respond', activate: visibleTrap(trap) && !effectUnavailableReason(view, trap) };
      } else {
        const commands = mainCommands(view);
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        command = commands[random % commands.length];
      }
      const before = snapshot;
      snapshot = await submit(session, snapshot, command);
      expect(snapshot.revision).toBe(before.revision + 1);
      if (step % 17 === 0) {
        const restored = new LocalSession(storage);
        expect(await restored.load()).toEqual(snapshot);
        session = restored;
      }
    }
    expect(snapshot.view.result).not.toBeNull();
    const undone = await session.undo(snapshot.revision);
    expect(undone.view.result).toBeNull();
    expect(await new LocalSession(storage).load()).toEqual(undone);
  });
});
