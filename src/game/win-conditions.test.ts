import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, RuleError } from './engine';
import type { CardDefId, GameCommand, GameState, PlayerId } from './types';

// Boundary positions retain all thirty physical cards and all eleven souls.
function position(): GameState {
  const state = createGame({ seed: 641, startingPlayer: 0 });
  Object.assign(state, { turn: 3, turnPlayer: 0, decisionPlayer: 0, actionsUsed: 0, pending: null, result: null, history: [] });
  for (const player of state.players) {
    Object.assign(player, { health: 15, deck: [], hand: [], field: [], graveyard: [], trap: null });
  }
  for (const card of Object.values(state.cards)) {
    Object.assign(card, { souls: 0, summonedTurn: 0 });
    state.players[card.owner].deck.push(card.id);
  }
  state.supply = 11;
  return state;
}

function place(state: GameState, def: CardDefId, owner: PlayerId, zone: 'field' | 'hand' | 'trap' = 'field', souls = 0, controller = owner): string {
  const card = Object.values(state.cards).find(card => card.owner === owner && card.def === def)!;
  for (const player of state.players) {
    for (const area of ['deck', 'hand', 'field', 'graveyard'] as const) player[area] = player[area].filter(id => id !== card.id);
    if (player.trap === card.id) player.trap = null;
  }
  if (zone === 'trap') state.players[controller].trap = card.id;
  else state.players[controller][zone].push(card.id);
  state.supply += card.souls - souls;
  card.souls = souls;
  return card.id;
}

function leaveDeck(state: GameState, player: PlayerId, count: number): void {
  state.players[player].graveyard.push(...state.players[player].deck.splice(count));
}

const act = (state: GameState, command: GameCommand) => applyCommand(state, state.decisionPlayer, command);

function expectFinished(state: GameState, winner: PlayerId): void {
  expect(state.result).toEqual({ winner, reason: 'health reached zero' });
  expect(state.phase).toBe('finished');
  expect(state.pending).toBeNull();
  expect(state.decisionPlayer).toBe(state.turnPlayer);
  expect(state.players[winner === 0 ? 1 : 0].health).toBe(0);
  expect(state.history.at(-1)).toBe(`${state.players[winner].name} wins.`);
  const zones = state.players.flatMap(player => [...player.deck, ...player.hand, ...player.field, ...player.graveyard, ...(player.trap ? [player.trap] : [])]);
  expect(zones).toHaveLength(30);
  expect(new Set(zones).size).toBe(30);
  expect(state.supply + Object.values(state.cards).reduce((sum, card) => sum + card.souls, 0)).toBe(11);
}

describe('rulebook game-end and damage boundaries', () => {
  it('starts both players at fifteen health', () => {
    expect(createGame({ seed: 5 }).players.map(player => player.health)).toEqual([15, 15]);
  });

  it.each([2, 1])('direct attack ends immediately at or below zero health (%i remaining)', health => {
    const state = position();
    const attacker = place(state, 'kappa', 0);
    state.players[1].health = health;
    const before = structuredClone(state);
    const finished = act(state, { type: 'attack', attacker, target: null });
    expectFinished(finished, 0);
    expect(finished.turn).toBe(3);
    expect(finished.turnPlayer).toBe(0);
    expect(finished.players[1].hand).toEqual([]);
    expect(state).toEqual(before);
  });

  it('one health remaining is not a win and the next player receives their normal draw', () => {
    const state = position();
    const attacker = place(state, 'kappa', 0);
    state.players[1].health = 3;
    const next = act(state, { type: 'attack', attacker, target: null });
    expect(next.result).toBeNull();
    expect(next.players[1].health).toBe(1);
    expect(next.players[1].hand).toHaveLength(1);
    expect(next.turn).toBe(4);
  });

  it('the defeated defender takes only the ATK difference, with an exact lethal threshold', () => {
    const state = position();
    const attacker = place(state, 'kappa', 0, 'field', 2); // 6 ATK.
    const target = place(state, 'tengu', 1); // 4 ATK.
    state.players[1].health = 2;
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 0);
    expect(finished.players[1].graveyard).toContain(target);
    expect(finished.players[0].health).toBe(15);
    expect(finished.turn).toBe(3);
  });

  it('a defending winner can kill the attacker, charging the current controller rather than card owner', () => {
    const state = position();
    const attacker = place(state, 'kappa', 1, 'field', 0, 0);
    const target = place(state, 'nurikabe', 0, 'field', 0, 1);
    state.players[0].health = 3;
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 1);
    expect(finished.players[1].health).toBe(15);
    expect(finished.players[1].graveyard).toContain(attacker);
    expect(finished.players[0].graveyard).not.toContain(attacker);
    expect(finished.turnPlayer).toBe(0);
  });

  it('equal ATK destroys both yokai without killing either one-health player', () => {
    const state = position();
    const attacker = place(state, 'kappa', 0);
    const target = place(state, 'zashiki-warashi', 1);
    state.players.forEach(player => { player.health = 1; });
    const next = act(state, { type: 'attack', attacker, target });
    expect(next.result).toBeNull();
    expect(next.players.map(player => player.health)).toEqual([1, 1]);
    expect(next.players[0].graveyard).toContain(attacker);
    expect(next.players[1].graveyard).toContain(target);
  });

  it('an empty mandatory draw deals exactly one damage to the opponent, not its drawer', () => {
    const state = position();
    leaveDeck(state, 1, 0);
    state.players[1].health = 1;
    const next = act(state, { type: 'endTurn' });
    expect(next.result).toBeNull();
    expect(next.players.map(player => player.health)).toEqual([14, 1]);
    expect(next.players[1].hand).toEqual([]);
  });

  it('drawing the last actual card is safe; damage begins on the next failed draw', () => {
    let state = position();
    leaveDeck(state, 1, 1);
    state.players[0].health = 1;
    state = act(state, { type: 'endTurn' });
    expect(state.players[1].deck).toHaveLength(0);
    expect(state.players[1].hand).toHaveLength(1);
    expect(state.result).toBeNull();
    state = act(state, { type: 'endTurn' });
    const finished = act(state, { type: 'endTurn' });
    expectFinished(finished, 1);
    expect(finished.turn).toBe(6);
  });

  it('empty-deck damage remains active with no hands, traps or yokai; an empty table is not a stalemate', () => {
    let state = position();
    leaveDeck(state, 0, 0);
    leaveDeck(state, 1, 0);
    state.players[0].health = 2;
    state.players[1].health = 2;
    state = act(state, { type: 'endTurn' });
    state = act(state, { type: 'endTurn' });
    expect(state.result).toBeNull();
    expect(state.players.map(player => player.health)).toEqual([1, 1]);
    expectFinished(act(state, { type: 'endTurn' }), 1);
  });
});

describe('lethal extra draws and pending attacks', () => {
  it.each([1, 2])('Kozuchi with no deck deals one damage per missed draw until lethal (%i health)', health => {
    const state = position();
    const spell = place(state, 'kozuchi', 0, 'hand');
    leaveDeck(state, 0, 0);
    state.players[1].health = health;
    const finished = act(state, { type: 'play', cardId: spell });
    expectFinished(finished, 0);
    expect(finished.history.filter(entry => entry.includes('could not draw'))).toHaveLength(health);
    expect(finished.players[0].graveyard).toContain(spell);
    expect(finished.actionsUsed).toBe(1);
    expect(finished.turn).toBe(3);
  });

  it('Kozuchi draws its remaining card before the second draw wins through deck exhaustion', () => {
    const state = position();
    const spell = place(state, 'kozuchi', 0, 'hand');
    leaveDeck(state, 0, 1);
    const remaining = state.players[0].deck[0];
    state.players[1].health = 1;
    const finished = act(state, { type: 'play', cardId: spell });
    expectFinished(finished, 0);
    expect(finished.players[0].hand).toEqual([remaining]);
    expect(finished.history.filter(entry => entry.includes('could not draw'))).toHaveLength(1);
  });

  it('Kozuchi cannot win through deck exhaustion while both requested cards still exist', () => {
    const state = position();
    const spell = place(state, 'kozuchi', 0, 'hand');
    leaveDeck(state, 0, 2);
    state.players[1].health = 1;
    const next = act(state, { type: 'play', cardId: spell });
    expect(next.result).toBeNull();
    expect(next.players[1].health).toBe(1);
    expect(next.players[0].hand).toHaveLength(2);
  });

  it('a lethal defensive Kozuchi cancels the queued attack and skips its second failed draw', () => {
    const state = position();
    const attacker = place(state, 'kappa', 0, 'field', 3);
    const trap = place(state, 'kozuchi', 1, 'trap');
    leaveDeck(state, 1, 0);
    state.players[0].health = 1;
    state.players[1].health = 1;
    const response = act(state, { type: 'attack', attacker, target: null });
    const finished = act(response, { type: 'respond', activate: true });
    expectFinished(finished, 1);
    expect(finished.players[1].health).toBe(1);
    expect(finished.players[1].graveyard).toContain(trap);
    expect(finished.history.filter(entry => entry.includes('could not draw'))).toHaveLength(1);
    expect(finished.history.some(entry => entry.includes('damage (direct attack)'))).toBe(false);
    expect(finished.turn).toBe(3);
  });

  it('lethal battle damage prevents a possessed Rokurokubi from drawing an additional card', () => {
    const state = position();
    const attacker = place(state, 'rokurokubi', 0, 'field', 2);
    const target = place(state, 'kappa', 1);
    state.players[1].health = 3;
    const deck = [...state.players[0].deck];
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 0);
    expect(finished.players[0].deck).toEqual(deck);
    expect(finished.players[0].hand).toEqual([]);
    expect(finished.history).not.toContain('Rokurokubi draws for battle destruction.');
  });

  it('a defending Rokurokubi can win with its empty-deck draw after nonlethal battle damage', () => {
    const state = position();
    const attacker = place(state, 'kappa', 0);
    const target = place(state, 'rokurokubi', 1, 'field', 1);
    leaveDeck(state, 1, 0);
    state.players[0].health = 3;
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 1);
    expect(finished.history.filter(entry => entry.includes('takes'))).toEqual([
      'Player 1 takes 2 damage (battle).',
      'Player 1 takes 1 damage (Player 2 could not draw).',
    ]);
    expect(finished.turn).toBe(3);
  });

  it('Yuki-onna survival prevents Rokurokubi extra-draw damage but does not prevent lethal battle damage', () => {
    const state = position();
    const attacker = place(state, 'rokurokubi', 0, 'field', 2);
    const target = place(state, 'yuki-onna', 1, 'field', 1);
    leaveDeck(state, 0, 0);
    state.players[1].health = 2;
    const next = act(state, { type: 'attack', attacker, target });
    expect(next.result).toBeNull();
    expect(next.players[1].health).toBe(1);
    expect(next.players[1].field).toContain(target);
    expect(next.cards[target].souls).toBe(0);
    expect(next.history).not.toContain('Rokurokubi draws for battle destruction.');

    state.players[1].health = 1;
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 0);
    expect(finished.players[1].field).toContain(target);
    expect(finished.cards[target].souls).toBe(0);
  });
});

describe('documented immediate-end timing', () => {
  // The rulebook establishes immediate game end at zero, but does not explicitly
  // order simultaneous possession triggers or Tengu against the main-phase draw.
  // These cases guard the app's existing provisional ordering, not an official FAQ.
  it('a lethal Rokurokubi draw stops the end-of-battle Chochin effect', () => {
    const state = position();
    const attacker = place(state, 'rokurokubi', 0, 'field', 1);
    const target = place(state, 'chochin-kozo', 1, 'field', 1);
    leaveDeck(state, 0, 0);
    state.players[1].health = 2; // One battle damage, then one failed-draw damage.
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 0);
    expect(finished.players[0].field).toContain(attacker);
    expect(finished.players[1].graveyard).toContain(target);
    expect(finished.turn).toBe(3);
  });

  it('tied possessed Rokurokubi resolve the attacker draw first and stop after the first lethal result', () => {
    const state = position();
    const attacker = place(state, 'rokurokubi', 0, 'field', 1);
    const target = place(state, 'rokurokubi', 1, 'field', 1);
    leaveDeck(state, 0, 0);
    leaveDeck(state, 1, 0);
    state.players.forEach(player => { player.health = 1; });
    const finished = act(state, { type: 'attack', attacker, target });
    expectFinished(finished, 0);
    expect(finished.players[0].health).toBe(1);
    expect(finished.history.filter(entry => entry === 'Rokurokubi draws for battle destruction.')).toHaveLength(1);
  });

  it('Tengu lethal self-damage stops before mandatory draw, charging its controller', () => {
    const state = position();
    place(state, 'tengu', 0, 'field', 0, 1);
    state.players[1].health = 1;
    const deck = [...state.players[1].deck];
    const finished = act(state, { type: 'endTurn' });
    expectFinished(finished, 0);
    expect(finished.players[1].deck).toEqual(deck);
    expect(finished.players[1].hand).toEqual([]);
    expect(finished.turn).toBe(4);
  });

  it('multiple controlled Tengu stop triggering when the first one is lethal', () => {
    const state = position();
    place(state, 'tengu', 0, 'field', 0, 1);
    place(state, 'tengu', 1);
    state.players[1].health = 1;
    const finished = act(state, { type: 'endTurn' });
    expectFinished(finished, 0);
    expect(finished.history.filter(entry => entry.includes('damage (Tengu)'))).toHaveLength(1);
  });

  it('no command is accepted after victory and rejected actions cannot mutate the result', () => {
    const state = position();
    const attacker = place(state, 'kappa', 0);
    state.players[1].health = 1;
    const finished = act(state, { type: 'attack', attacker, target: null });
    const before = structuredClone(finished);
    const commands: GameCommand[] = [
      { type: 'endTurn' }, { type: 'attack', attacker, target: null },
      { type: 'evoke', cardId: attacker }, { type: 'release', cardId: attacker },
      { type: 'play', cardId: attacker }, { type: 'setTrap', cardId: attacker },
      { type: 'respond', activate: false }, { type: 'choose', targets: [] },
    ];
    for (const actor of [0, 1] as const) {
      for (const command of commands) expect(() => applyCommand(finished, actor, command)).toThrow(RuleError);
    }
    expect(finished).toEqual(before);
  });
});
