import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from '../game/engine';
import { CARDS } from '../game/catalog';
import { viewForLocalTesting, viewForPlayer } from '../game/views';
import type { CardDefId, GameState, PlayerId } from '../game/types';
import { BASE_WEIGHTS, chooseAiCommand, legalCommands, seededRandom } from './opponent';

function fixture(): GameState {
  const state = createGame({ seed: 1, startingPlayer: 0 });
  for (const player of state.players) {
    player.deck = []; player.hand = []; player.field = []; player.graveyard = []; player.trap = null;
  }
  for (const card of Object.values(state.cards)) {
    card.souls = 0; card.summonedTurn = 0; state.players[card.owner].deck.push(card.id);
  }
  Object.assign(state, { turn: 3, supply: 11, actionsUsed: 0, phase: 'main', pending: null, result: null, history: [] });
  return state;
}
function put(state: GameState, def: CardDefId, owner: PlayerId, zone: 'field' | 'hand' | 'graveyard' | 'trap' = 'field', souls = 0): string {
  const card = Object.values(state.cards).find(card => card.owner === owner && card.def === def)!;
  state.players[owner].deck = state.players[owner].deck.filter(id => id !== card.id);
  if (zone === 'trap') state.players[owner].trap = card.id;
  else state.players[owner][zone].push(card.id);
  card.souls = souls; state.supply -= souls;
  return card.id;
}
const quick = { samples: 1, depth: 2, beamWidth: 2 };

describe('fair AI opponent', () => {
  it('exports finite trainable weights and reproducible randomness', () => {
    expect(Object.values(BASE_WEIGHTS).every(Number.isFinite)).toBe(true);
    const a = seededRandom(42), b = seededRandom(42);
    expect(Array.from({ length: 10 }, () => a())).toEqual(Array.from({ length: 10 }, () => b()));
  });

  it('refuses views exposing the opposing hand', () => {
    expect(() => chooseAiCommand(viewForLocalTesting(createGame({ seed: 1 })))).toThrow(/private|hidden|opponent/i);
  });

  it('makes the same decision when actual hidden hands, traps, and deck orders differ', () => {
    const first = fixture();
    put(first, 'kappa', 0); put(first, 'yuki-onna', 0, 'hand');
    put(first, 'tengu', 1); put(first, 'sake', 1, 'trap'); put(first, 'jufu', 1, 'hand');
    const second = structuredClone(first);
    const hidden = [second.players[1].trap!, ...second.players[1].hand, ...second.players[1].deck];
    const defs = hidden.map(id => second.cards[id].def).reverse();
    const spellIndex = defs.findIndex(def => CARDS[def].kind === 'spell');
    [defs[0], defs[spellIndex]] = [defs[spellIndex], defs[0]];
    hidden.forEach((id, index) => { second.cards[id].def = defs[index]; });
    second.players[1].deck.reverse(); second.players[0].deck.reverse();
    expect(viewForPlayer(first, 0)).toEqual(viewForPlayer(second, 0));
    const options = { ...quick, random: seededRandom(123) };
    expect(chooseAiCommand(viewForPlayer(first, 0), options)).toEqual(chooseAiCommand(viewForPlayer(second, 0), { ...quick, random: seededRandom(123) }));
  });

  it('takes a direct lethal attack', () => {
    const state = fixture(), attacker = put(state, 'kappa', 0, 'field', 3);
    put(state, 'nurikabe', 0, 'hand'); state.players[1].health = 8;
    expect(chooseAiCommand(viewForPlayer(state, 0), { ...quick, random: seededRandom(3) })).toEqual({ type: 'attack', attacker, target: null });
  });

  it('sees a spell-clear then lethal attack', () => {
    const state = fixture(); put(state, 'kappa', 0, 'field', 3);
    put(state, 'nurikabe', 1, 'field', 1); const spell = put(state, 'jufu', 0, 'hand');
    state.players[1].health = 8;
    expect(chooseAiCommand(viewForPlayer(state, 0), { samples: 1, depth: 3, beamWidth: 4, random: seededRandom(4) })).toEqual({ type: 'play', cardId: spell });
  });

  it('enumerates split Sake allocations, including all three souls', () => {
    const state = fixture(), a = put(state, 'kappa', 0), b = put(state, 'yuki-onna', 0);
    const spell = put(state, 'sake', 0, 'hand');
    const pending = applyCommand(state, 0, { type: 'play', cardId: spell });
    const options = legalCommands(viewForPlayer(pending, 0));
    expect(options).toContainEqual({ type: 'choose', allocations: [{ cardId: a, count: 2 }, { cardId: b, count: 1 }] });
    expect(options).toContainEqual({ type: 'choose', allocations: [{ cardId: a, count: 3 }] });
    for (const option of options) expect(() => applyCommand(pending, 0, option)).not.toThrow();
  });

  it('targets a concealed trap through its public seat alias', () => {
    const state = fixture(), umbrella = put(state, 'karakasa-kozo', 0, 'field', 1);
    put(state, 'sake', 1, 'trap');
    const pending = applyCommand(state, 0, { type: 'release', cardId: umbrella });
    expect(legalCommands(viewForPlayer(pending, 0))).toEqual([{ type: 'choose', targets: ['trap:1'] }]);
    expect(chooseAiCommand(viewForPlayer(pending, 0), quick)).toEqual({ type: 'choose', targets: ['trap:1'] });
  });

  it('models stolen cards by original owner without mutating the view', () => {
    const state = fixture(), thief = put(state, 'nekomata', 0, 'field', 1), stolen = put(state, 'kappa', 1, 'field', 2);
    const changed = applyCommand(applyCommand(state, 0, { type: 'release', cardId: thief }), 0, { type: 'choose', targets: [stolen] });
    const view = viewForPlayer(changed, 0), before = structuredClone(view);
    expect(() => applyCommand(changed, 0, chooseAiCommand(view, quick))).not.toThrow();
    expect(view).toEqual(before);
  });

  it.each(['jufu', 'boseki', 'ougi', 'hamaya', 'karakasa-kozo', 'nekomata'] as const)('enumerates every legal %s target choice', def => {
    const state = fixture();
    const source = def === 'karakasa-kozo' || def === 'nekomata'
      ? put(state, def, 0, 'field', 1) : put(state, def, 0, 'hand');
    put(state, 'kappa', 0, 'field', 1); put(state, 'yuki-onna', 1, 'field', 1);
    put(state, 'nurikabe', 1, 'graveyard'); put(state, 'sake', 1, 'trap');
    const pending = applyCommand(state, 0, { type: def === 'karakasa-kozo' || def === 'nekomata' ? 'release' : 'play', cardId: source });
    const commands = legalCommands(viewForPlayer(pending, 0));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(() => applyCommand(pending, 0, command)).not.toThrow();
    const decision = chooseAiCommand(viewForPlayer(pending, 0), { ...quick, random: seededRandom(7) });
    expect(commands).toContainEqual(decision);
  });

  it('preserves spell immunity and maximum-attack restrictions', () => {
    const state = fixture(); put(state, 'zashiki-warashi', 1, 'field', 2);
    put(state, 'karakasa-kozo', 0); const hamaya = put(state, 'hamaya', 0, 'hand');
    expect(legalCommands(viewForPlayer(state, 0))).not.toContainEqual({ type: 'play', cardId: hamaya });
    const sake = put(state, 'sake', 0, 'hand');
    const pending = applyCommand(state, 0, { type: 'play', cardId: sake });
    for (const command of legalCommands(viewForPlayer(pending, 0))) {
      expect(() => applyCommand(pending, 0, command)).not.toThrow();
      if (command.type === 'choose') expect(command.allocations?.some(allocation => state.cards[allocation.cardId].def === 'zashiki-warashi')).toBe(false);
    }
  });

  it('activates a trap to prevent lethal damage', () => {
    const state = fixture(), attacker = put(state, 'kappa', 0, 'field', 3);
    put(state, 'jufu', 1, 'trap'); state.players[1].health = 2;
    const pending = applyCommand(state, 0, { type: 'attack', attacker, target: null });
    expect(chooseAiCommand(viewForPlayer(pending, 1), { ...quick, random: seededRandom(6) })).toEqual({ type: 'respond', activate: true });
  });

  it('keeps terminal losses below any finite learned evaluation', () => {
    const state = fixture(), attacker = put(state, 'kappa', 0, 'field', 3);
    put(state, 'jufu', 1, 'trap'); state.players[1].health = 2;
    const pending = applyCommand(state, 0, { type: 'attack', attacker, target: null });
    expect(chooseAiCommand(viewForPlayer(pending, 1), { ...quick, weights: { health: 1000000 }, random: seededRandom(6) })).toEqual({ type: 'respond', activate: true });
  });

  it('knows empty-deck draws damage the opponent and terminal wins dominate mutated weights', () => {
    const state = fixture(), spell = put(state, 'kozuchi', 0, 'hand');
    state.players[0].graveyard.push(...state.players[0].deck); state.players[0].deck = [];
    state.players[1].health = 2;
    const weights = Object.fromEntries(Object.keys(BASE_WEIGHTS).map(key => [key, -100]));
    expect(chooseAiCommand(viewForPlayer(state, 0), { ...quick, weights, random: seededRandom(8) })).toEqual({ type: 'play', cardId: spell });
  });

  it.each([1, 2, 3, 4])('both seats finish a legal match with seed %i', seed => {
    let state = createGame({ seed }); const random = seededRandom(seed + 100);
    for (let step = 0; !state.result && step < 500; step++) {
      const actor = state.decisionPlayer, view = viewForPlayer(state, actor);
      const commands = legalCommands(view);
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) expect(() => applyCommand(state, actor, command)).not.toThrow();
      const command = chooseAiCommand(view, { ...quick, random, exploration: 0.12 });
      state = applyCommand(state, actor, command);
    }
    expect(state.result).not.toBeNull();
  }, 20000);
});
