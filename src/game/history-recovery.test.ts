import { expect, it } from 'vitest';
import { applyCommand, createGame } from './engine';
import { historyText } from './history';
import { recoverHistory } from './history-recovery';
import { CARDS } from './catalog';
import type { GameCommand, GameState } from './types';

it('recovers exact card owners from old text logs without changing their text or the position', () => {
  const initial = createGame({ seed: 45, startingPlayer: 0 });
  const cardId = initial.players[0].hand.find(id => CARDS[initial.cards[id].def].kind === 'yokai')!;
  const commands: GameCommand[] = [{ type: 'play', cardId }, { type: 'evoke', cardId }];
  const checkpoints = [];
  let state = initial;
  for (const command of commands) {
    const { history, ...position } = state;
    checkpoints.push({ ...position, historyLength: history.length });
    state = applyCommand(state, 0, command);
  }
  const legacy: GameState = { ...state, history: state.history.map(historyText) };
  const before = structuredClone(legacy);
  const history = recoverHistory(legacy, checkpoints, commands.map(command => [{ actor: 0, command }]));
  expect(history.map(historyText)).toEqual(legacy.history);
  expect(history.at(-1)).toEqual({ actor: 0, parts: ['Player 1 evokes a soul onto ', { card: initial.cards[cardId].def, owner: 0 }, '.'] });
  expect(legacy).toEqual(before);
  expect(recoverHistory({ ...legacy, history }, checkpoints, [])).toBe(history);
});

it('does not replace an entry using a receipt from a different undo branch', () => {
  const initial = createGame({ seed: 45, startingPlayer: 0 });
  const cardId = initial.players[0].hand.find(id => CARDS[initial.cards[id].def].kind === 'yokai')!;
  const state = applyCommand(initial, 0, { type: 'play', cardId });
  const { history, ...position } = initial;
  const legacy = { ...state, history: state.history.map(historyText) };
  expect(recoverHistory(legacy, [{ ...position, historyLength: history.length }], [[{ actor: 0, command: { type: 'endTurn' } }]])).toBe(legacy.history);
});
