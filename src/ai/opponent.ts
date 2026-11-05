import { CARDS, DECK } from '../game/catalog';
import { applyCommand, attackOf } from '../game/engine';
import { viewForPlayer } from '../game/views';
import type { CardInstance, GameCommand, GameState, GameView, PlayerId, VisibleCard } from '../game/types';
import { actionUnavailableReason, allVisible, canConfirmEffect, decisionCandidates, effectCommand, effectSource, effectUnavailableReason, emptyDraft } from '../ui/interaction';

export type AiWeights = Record<string, number>;
export const BASE_WEIGHTS: AiWeights = {
  health: 5, field: 2.8, attack: 0.7, souls: 0.35, hand: 0.55, trap: 0.8,
  pressure: 0.5, tempo: 0.15, possession: 1,
  ...Object.fromEntries(DECK.map(def => [`card:${def}`, def === 'tengu' ? -0.7 : def === 'yuki-onna' ? 0.5 : 0])),
};
export interface AiOptions {
  weights?: AiWeights;
  random?: () => number;
  samples?: number;
  depth?: number;
  beamWidth?: number;
  exploration?: number;
}

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const visibleTrap = (trap: GameView['players'][number]['trap']): trap is VisibleCard => !!trap && !('hidden' in trap);

/** Enumerate decisions using exactly the same visible rules as the human controls. */
export function legalCommands(view: GameView): GameCommand[] {
  if (view.result || view.phase === 'finished') return [];
  if (view.phase === 'turnEnd') return [{ type: 'endTurn' }];
  const own = view.players[view.decisionPlayer];
  if (view.phase === 'trap') {
    return [{ type: 'respond', activate: false }, ...(visibleTrap(own.trap) && !effectUnavailableReason(view, own.trap) ? [{ type: 'respond' as const, activate: true }] : [])];
  }
  if (view.phase === 'effect') {
    const source = effectSource(view);
    if (!source) return [];
    const candidates = decisionCandidates(view, emptyDraft());
    if (source.def === 'sake') {
      const commands: GameCommand[] = [];
      const allocate = (index: number, remaining: number, allocations: Record<string, number>) => {
        if (index === candidates.cards.length) {
          commands.push(effectCommand(view, { ...emptyDraft(), allocations }));
          return;
        }
        const card = candidates.cards[index], maximum = Math.min(remaining, card.definition.cap - card.souls);
        for (let count = 0; count <= maximum; count++) allocate(index + 1, remaining - count, count ? { ...allocations, [card.id]: count } : allocations);
      };
      allocate(0, Math.min(3, view.supply), {});
      return commands;
    }
    const ids = [...candidates.cards.map(card => card.id), ...candidates.hiddenTrapSeats.map(seat => `trap:${seat}`)];
    const choices: string[][] = candidates.minimum === 0 ? [[]] : [];
    if (source.def === 'ougi') {
      const fields = view.players.flatMap(player => player.field);
      for (const from of ids) for (const to of fields.map(card => card.id)) if (from !== to) choices.push([from, to]);
    } else {
      for (let i = 0; i < ids.length; i++) {
        choices.push([ids[i]]);
        if (candidates.maximum > 1) for (let j = i + 1; j < ids.length; j++) choices.push([ids[i], ids[j]]);
      }
    }
    return choices.filter(targets => canConfirmEffect(view, { ...emptyDraft(), targets })).map(targets => ({ type: 'choose', targets }));
  }
  const commands: GameCommand[] = [];
  for (const card of [...(own.hand ?? []), ...own.field, ...(visibleTrap(own.trap) ? [own.trap] : [])]) {
    for (const type of ['play', 'evoke', 'release', 'setTrap'] as const) {
      if (!actionUnavailableReason(view, card, type)) commands.push({ type, cardId: card.id });
    }
    if (!actionUnavailableReason(view, card, 'attack')) {
      const targets = view.players[1 - view.decisionPlayer].field;
      for (const target of targets.length ? targets.map(card => card.id) : [null]) commands.push({ type: 'attack', attacker: card.id, target });
    }
  }
  commands.push({ type: 'endTurn' });
  return commands;
}

/** Hidden cards are guesses drawn from deck composition, never canonical match data. */
function sampleState(view: GameView, random: () => number): GameState {
  const cards: Record<string, CardInstance> = {};
  for (const card of allVisible(view)) cards[card.id] = { id: card.id, def: card.def, owner: card.owner, souls: card.souls, summonedTurn: card.summonedTurn };
  const players = view.players.map(player => ({
    name: player.name, health: player.health, deck: [] as string[], hand: (player.hand ?? []).map(card => card.id),
    field: player.field.map(card => card.id), graveyard: player.graveyard.map(card => card.id), trap: visibleTrap(player.trap) ? player.trap.id : null as string | null,
  })) as GameState['players'];
  for (const owner of [0, 1] as const) {
    const remaining = [...DECK];
    for (const card of Object.values(cards).filter(card => card.owner === owner)) {
      const index = remaining.indexOf(card.def);
      if (index < 0) throw new Error('Invalid visible deck composition.');
      remaining.splice(index, 1);
    }
    const makeCard = (index: number): string => {
      const [def] = remaining.splice(index, 1);
      let id = `ai:${owner}:${remaining.length}`;
      while (cards[id]) id += ':';
      cards[id] = { id, def, owner, souls: 0, summonedTurn: 0 };
      return id;
    };
    if (view.players[owner].trap && !visibleTrap(view.players[owner].trap)) {
      const spells = remaining.flatMap((def, index) => CARDS[def].kind === 'spell' ? [index] : []);
      if (!spells.length) throw new Error('A hidden trap must be one of the remaining spells.');
      players[owner].trap = makeCard(spells[Math.floor(random() * spells.length)]);
    }
    const unknownHand = view.players[owner].hand === null ? view.players[owner].handCount : 0;
    if (remaining.length !== unknownHand + view.players[owner].deckCount) throw new Error('Invalid visible card counts.');
    for (let i = 0; i < unknownHand; i++) players[owner].hand.push(makeCard(Math.floor(random() * remaining.length)));
    while (remaining.length) players[owner].deck.push(makeCard(Math.floor(random() * remaining.length)));
  }
  return {
    rulesVersion: 1, turn: view.turn, turnPlayer: view.turnPlayer, decisionPlayer: view.decisionPlayer,
    phase: view.phase, actionsUsed: view.actionsUsed, supply: view.supply, cards, players,
    pending: structuredClone(view.pending), result: structuredClone(view.result), history: [],
  };
}

function evaluate(state: GameState, actor: PlayerId, weights: AiWeights): number {
  if (state.result) return state.result.winner === null ? 0 : state.result.winner === actor ? 100000 : -100000;
  const strength = (player: PlayerId): number => {
    const own = state.players[player], enemy = state.players[1 - player];
    let score = own.health * weights.health + own.field.length * weights.field + own.hand.length * weights.hand + Number(!!own.trap) * weights.trap;
    for (const id of own.field) {
      const card = state.cards[id];
      score += attackOf(state, id) * weights.attack + card.souls * weights.souls + (weights[`card:${card.def}`] ?? 0);
      if (card.souls > 0) {
        const ability = card.def === 'yuki-onna' ? 1.3 : card.def === 'chochin-kozo' ? 1.1 : card.def === 'nekomata' && enemy.field.length ? 0.9 : card.def === 'zashiki-warashi' ? 0.6 : card.def === 'rokurokubi' ? 0.4 : 0;
        score += ability * weights.possession;
      }
      if (card.def === 'tengu') score -= weights.health / Math.max(2, own.health);
    }
    const strongest = Math.max(0, ...own.field.map(id => attackOf(state, id)));
    const weakestEnemy = enemy.field.length ? Math.min(...enemy.field.map(id => attackOf(state, id))) : 0;
    score += Math.max(0, strongest - weakestEnemy) * weights.pressure;
    // Empty-deck draws damage the opponent in Yokai, so drawing out is an advantage.
    score += (own.deck.length === 0 ? 2 : 1 / own.deck.length) * weights.pressure;
    if (state.turnPlayer === player && state.phase === 'main') score += (2 - state.actionsUsed) * weights.tempo;
    return score;
  };
  return Math.max(-10000, Math.min(10000, strength(actor) - strength(actor === 0 ? 1 : 0)));
}

type Position = { state: GameState; first: number; score: number };

/** Resolve spell selections and trap responses from each simulated actor's private projection. */
function resolvePending(state: GameState, actor: PlayerId, weights: AiWeights): GameState {
  if (state.phase !== 'trap' && state.phase !== 'effect') return state;
  const deciding = state.decisionPlayer, commands = legalCommands(viewForPlayer(state, deciding));
  let best: GameState | undefined, bestScore = deciding === actor ? -Infinity : Infinity;
  for (const command of commands) {
    const next = resolvePending(applyCommand(state, deciding, command), actor, weights), score = evaluate(next, actor, weights);
    if (!best || (deciding === actor ? score > bestScore : score < bestScore)) { best = next; bestScore = score; }
  }
  if (!best) throw new Error('The AI could not resolve a pending decision.');
  return best;
}

function finishTurn(state: GameState): GameState {
  return !state.result && (state.phase === 'main' || state.phase === 'turnEnd') ? applyCommand(state, state.decisionPlayer, { type: 'endTurn' }) : state;
}

/** Keep a small beam of action sequences and one completed turn per root action. */
function turnPlans(state: GameState, commands: GameCommand[], actor: PlayerId, weights: AiWeights, depth: number, width: number): Map<number, Position> {
  const completed = new Map<number, Position>();
  let beam: Position[] = [];
  const add = (next: GameState, first: number, frontier: Position[]) => {
    const resolved = resolvePending(next, actor, weights);
    const canContinue = !resolved.result && resolved.phase === 'main' && resolved.turnPlayer === actor && resolved.decisionPlayer === actor;
    const ended = canContinue || resolved.phase === 'turnEnd' ? finishTurn(resolved) : resolved;
    const score = evaluate(ended, actor, weights), previous = completed.get(first);
    if (!previous || score > previous.score) completed.set(first, { state: ended, first, score });
    if (canContinue) frontier.push({ state: resolved, first, score: evaluate(resolved, actor, weights) });
  };
  commands.forEach((command, first) => add(applyCommand(state, state.decisionPlayer, command), first, beam));
  for (let level = 1; level < depth && beam.length; level++) {
    beam.sort((a, b) => b.score - a.score);
    const next: Position[] = [];
    for (const position of beam.slice(0, width)) {
      const view = viewForPlayer(position.state, position.state.decisionPlayer);
      for (const command of legalCommands(view)) {
        if (command.type !== 'endTurn') add(applyCommand(position.state, view.decisionPlayer, command), position.first, next);
      }
    }
    beam = next;
  }
  return completed;
}

export function chooseAiCommand(view: GameView, options: AiOptions = {}): GameCommand {
  const actor = view.decisionPlayer, enemy = view.players[1 - actor];
  if (view.players[actor].hand === null || enemy.hand !== null || visibleTrap(enemy.trap)) throw new Error('The AI requires a private player view with the opponent hand and trap hidden.');
  const commands = legalCommands(view);
  if (!commands.length) throw new Error('The AI has no legal decision.');
  if (commands.length === 1) return commands[0];
  const random = options.random ?? Math.random, weights = { ...BASE_WEIGHTS, ...options.weights };
  if (!Object.values(weights).every(Number.isFinite)) throw new Error('AI weights must be finite numbers.');
  const bounded = (value: number | undefined, fallback: number, maximum: number) => Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value!))) : fallback;
  const samples = bounded(options.samples, 2, 8), depth = bounded(options.depth, 4, 8), width = bounded(options.beamWidth, 4, 12);
  const plans = Array.from({ length: samples }, () => turnPlans(sampleState(view, random), commands, actor, weights, depth, width));
  const averages = commands.map((_, first) => plans.reduce((sum, sample) => sum + sample.get(first)!.score, 0) / samples);
  const order = commands.map((_, index) => index).sort((a, b) => averages[b] - averages[a]);
  const immediateWin = order.find(first => plans.every(sample => sample.get(first)!.state.result?.winner === actor));
  if (immediateWin !== undefined && averages[immediateWin] >= 100000) return commands[immediateWin];
  if (random() < (options.exploration ?? 0)) return commands[Math.floor(random() * commands.length)];
  // shortcut: narrow beams can miss long sacrifices; widen the budget when stronger play is needed.
  const finalists = order.slice(0, Math.max(2, width));
  let best = finalists[0], bestScore = -Infinity;
  for (const first of finalists) {
    let score = 0;
    for (const sample of plans) {
      const position = sample.get(first)!, next = position.state;
      if (!next.result && next.turnPlayer !== actor && next.phase === 'main') {
        const defender = next.decisionPlayer, replies = turnPlans(next, legalCommands(viewForPlayer(next, defender)), defender, weights, Math.min(3, depth), Math.min(2, width));
        score += Math.min(...[...replies.values()].map(reply => evaluate(reply.state, actor, weights)));
      } else score += position.score;
    }
    score = score / samples + random() * 0.0001;
    if (score > bestScore) { best = first; bestScore = score; }
  }
  return commands[best];
}
