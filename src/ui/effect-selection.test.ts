import { expect, it } from 'vitest';
import { applyCommand, createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import { emptyDraft } from './interaction';
import { resolveEffectTarget } from './drag';
it('continues the reported Hamaya trap by selecting its highlighted highest-attack target', () => {
  let state = createGame({ seed: 42, startingPlayer: 0 }); state.turn = 3;
  const put = (def: string, owner: 0 | 1, zone: 'field' | 'trap', souls = 0) => {
    const card = Object.values(state.cards).find(c => c.owner === owner && c.def === def)!;
    state.players[owner].deck = state.players[owner].deck.filter(id => id !== card.id); state.players[owner].hand = state.players[owner].hand.filter(id => id !== card.id);
    if (zone === 'field') state.players[owner].field.push(card.id); else state.players[owner].trap = card.id;
    card.souls = souls; state.supply -= souls; return card.id;
  };
  const yuki = put('yuki-onna', 0, 'field', 1); put('zashiki-warashi', 0, 'field', 1);
  const kappa = put('kappa', 1, 'field'); put('zashiki-warashi', 1, 'field'); put('hamaya', 1, 'trap');
  state = applyCommand(state, 0, { type: 'attack', attacker: yuki, target: kappa });
  state = applyCommand(state, 1, { type: 'respond', activate: true });
  const choice = resolveEffectTarget(viewForPlayer(state, 1), emptyDraft(), yuki);
  expect(choice.command).toEqual({ type: 'choose', targets: [yuki] });
  state = applyCommand(state, 1, choice.command!);
  expect(state.phase).toBe('turnEnd'); expect(state.pending).toBeNull(); expect(state.players[0].graveyard).toContain(yuki);
  expect(state.history.at(-1)).toBe('The declared attack is cancelled.');
  expect(applyCommand(state, 1, { type: 'endTurn' }).turn).toBe(4);
});
