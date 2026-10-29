import { expect, it } from 'vitest';
import { applyCommand, createGame } from './engine';
import type { GameState } from './types';

function position() {
  const state = createGame({ seed: 42, startingPlayer: 0 });
  state.turn = 3;
  for (const player of state.players) { player.deck.push(...player.hand); player.hand = []; }
  const attacker = state.players[0].deck.find(id => state.cards[id].def === 'tengu')!;
  state.players[0].deck = state.players[0].deck.filter(id => id !== attacker);
  state.players[0].field = [attacker];
  return { state, attacker };
}
const act = (state: GameState, command: Parameters<typeof applyCommand>[2]) => applyCommand(state, state.decisionPlayer, command);

it('shows battle results without starting or drawing the next turn', () => {
  const { state, attacker } = position();
  const after = act(state, { type: 'attack', attacker, target: null });
  expect(after).toMatchObject({ phase: 'turnEnd', turn: 3, turnPlayer: 0, decisionPlayer: 0, pending: null });
  expect(after.players[1].health).toBe(11);
  expect(after.players[1].hand).toEqual(state.players[1].hand);
  expect(() => act(after, { type: 'evoke', cardId: attacker })).toThrow();
  expect(() => act(after, { type: 'attack', attacker, target: null })).toThrow();
  const next = act(after, { type: 'endTurn' });
  expect(next).toMatchObject({ phase: 'main', turn: 4, turnPlayer: 1 });
  expect(next.players[1].hand).toHaveLength(1);
});
it('still finishes lethal immediately', () => {
  const { state, attacker } = position(); state.players[1].health = 2;
  expect(act(state, { type: 'attack', attacker, target: null })).toMatchObject({ phase: 'finished', turn: 3 });
});
it('waits after a defender declines a trap', () => {
  const { state, attacker } = position();
  const trap = state.players[1].deck.find(id => state.cards[id].def === 'jufu')!;
  state.players[1].deck = state.players[1].deck.filter(id => id !== trap); state.players[1].trap = trap;
  const response = act(state, { type: 'attack', attacker, target: null });
  expect(act(response, { type: 'respond', activate: false })).toMatchObject({ phase: 'turnEnd', turn: 3, decisionPlayer: 1 });
});
