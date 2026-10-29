import { expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import { transitionEvents } from './presentation';
it('identifies destruction, damage and soul returns without hidden card definitions', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const yokai = before.players[0].hand![0]; yokai.zone = 'field'; yokai.souls = 1; before.players[0].field = [yokai];
  const next = structuredClone(before); next.players[0].field = []; next.players[0].graveyard = [{ ...yokai, souls: 0, zone: 'graveyard' }]; next.players[0].health -= 3;
  const events = transitionEvents(before, next, { type: 'endTurn' });
  expect(events).toContainEqual(expect.objectContaining({ kind: 'death', card: expect.objectContaining({ id: yokai.id }) }));
  expect(events).toContainEqual(expect.objectContaining({ kind: 'damage', seat: 0, amount: 3 }));
});
it('does not animate a battle while a trap effect is still pending or cancelled it', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const card = before.players[0].hand![0]; card.zone = 'field'; before.players[0].field = [card];
  before.phase = 'trap'; before.pending = { kind: 'trap', actor: 1, attacker: card.id, target: null };
  const pending = structuredClone(before); pending.phase = 'effect';
  expect(transitionEvents(before, pending, { type: 'respond', activate: true }).some(e => e.kind === 'attack')).toBe(false);
  const cancelled = structuredClone(before); cancelled.phase = 'turnEnd'; cancelled.history.push('The declared attack is cancelled.');
  expect(transitionEvents(before, cancelled, { type: 'respond', activate: true }).some(e => e.kind === 'attack')).toBe(false);
});
it('does not replay a yokai drop or fly souls from Supply', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const card = before.players[0].hand!.find(c => c.definition.kind === 'yokai')!;
  const after = structuredClone(before); after.players[0].field = [{ ...card, zone: 'field', souls: 1 }];
  expect(transitionEvents(before, after, { type: 'play', cardId: card.id })).toEqual([]);
  const evoked = structuredClone(after); evoked.players[0].field[0].souls++;
  expect(transitionEvents(after, evoked, { type: 'evoke', cardId: card.id })).toEqual([]);
});
