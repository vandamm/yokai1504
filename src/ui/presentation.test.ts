import { afterEach, expect, it, vi } from 'vitest';
import { applyCommand, createGame, previewBattle } from '../game/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Playback } from './Playback';
import { viewForLocalTesting } from '../game/views';
import { transitionEvents } from './presentation';
afterEach(() => vi.unstubAllGlobals());

it('animates the attack and defeated Kappa using their post-trap live values', () => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const state = createGame({ seed: 42, startingPlayer: 0 }); state.turn = 3;
  const yuki = Object.values(state.cards).find(c => c.owner === 0 && c.def === 'yuki-onna')!;
  const kappa = Object.values(state.cards).find(c => c.owner === 1 && c.def === 'kappa')!;
  const trap = Object.values(state.cards).find(c => c.owner === 1 && c.def === 'ougi')!;
  for (const player of state.players) for (const zone of ['deck', 'hand'] as const) player[zone] = player[zone].filter(id => ![yuki.id, kappa.id, trap.id].includes(id));
  state.players[0].field = [yuki.id]; state.players[1].field = [kappa.id]; state.players[1].trap = trap.id;
  yuki.souls = 2; state.supply -= 2;
  const pending = applyCommand(applyCommand(state, 0, { type: 'attack', attacker: yuki.id, target: kappa.id }), 1, { type: 'respond', activate: true });
  const command = { type: 'choose' as const, targets: [yuki.id, kappa.id] };
  const battleView = viewForLocalTesting(previewBattle(pending, command)!);
  const events = transitionEvents(viewForLocalTesting(pending), viewForLocalTesting(applyCommand(pending, 1, command)), command, battleView);
  expect(events).toContainEqual(expect.objectContaining({ kind: 'attack', card: expect.objectContaining({ id: yuki.id, attack: 4, souls: 1 }) }));
  expect(events).toContainEqual(expect.objectContaining({ kind: 'death', card: expect.objectContaining({ id: kappa.id, attack: 4, souls: 1 }) }));
  const geometry = { [yuki.id]: { x: 0, y: 0, width: 90, height: 133 }, [kappa.id]: { x: 0, y: 200, width: 90, height: 133 }, 'graveyard:1': { x: 200, y: 200, width: 30, height: 44 } };
  const html = renderToStaticMarkup(createElement(Playback, { events, geometry, onComplete: () => {} }));
  expect(html.match(/live-attack modified/g)).toHaveLength(2);
  expect(html.match(/soul-slot filled/g)).toHaveLength(2);
  expect(renderToStaticMarkup(createElement(Playback, { events, geometry, delay: 1200, onComplete: () => {} }))).toBe('');
});
it('identifies destruction, damage and soul returns without hidden card definitions', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const yokai = before.players[0].hand![0]; yokai.zone = 'field'; yokai.souls = 1; before.players[0].field = [yokai];
  const next = structuredClone(before); next.players[0].field = []; next.players[0].graveyard = [{ ...yokai, souls: 0, zone: 'graveyard' }]; next.players[0].health -= 3;
  const events = transitionEvents(before, next, { type: 'endTurn' });
  expect(events).toContainEqual(expect.objectContaining({ kind: 'death', card: expect.objectContaining({ id: yokai.id }) }));
  expect(events).toContainEqual(expect.objectContaining({ kind: 'damage', seat: 0, amount: 3 }));
});
it('keeps live values for a yokai destroyed by the trap before combat starts', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const yokai = before.players[0].hand!.find(card => card.definition.kind === 'yokai')!;
  yokai.zone = 'field'; yokai.souls = 2; yokai.attack = yokai.definition.atk + 2;
  before.players[0].field = [yokai];
  const after = structuredClone(before); after.players[0].field = [];
  after.players[0].graveyard = [{ ...yokai, souls: 0, attack: yokai.definition.atk, zone: 'graveyard' }];
  const events = transitionEvents(before, after, { type: 'choose', targets: [yokai.id] }, after);
  expect(events).toContainEqual(expect.objectContaining({ kind: 'death', card: expect.objectContaining({ souls: 2, attack: yokai.attack }) }));
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

it('infers an opponent summon and attack from private snapshots without a fake command', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const card = before.players[0].hand!.find(c => c.definition.kind === 'yokai')!;
  before.players[0].hand = null;
  const after = structuredClone(before); after.players[0].field = [{ ...card, zone: 'field' }];
  expect(transitionEvents(before, after)).toContainEqual(expect.objectContaining({ kind: 'move', from: 'hand:0', to: 'field:0:0', card: expect.objectContaining({ id: card.id }) }));
  const attacked = structuredClone(after); attacked.phase = 'turnEnd'; attacked.players[1].health -= card.attack; attacked.history.push(`${after.players[0].name} attacks with ${card.definition.name} directly.`);
  expect(transitionEvents(after, attacked)).toContainEqual(expect.objectContaining({ kind: 'attack', from: card.id, to: 'health:1' }));
});

it('animates public spell reveals, revival and hidden trap placement without revealing a hidden card', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const spell = before.players[0].hand!.find(c => c.definition.kind === 'spell')!;
  const yokai = before.players[0].hand!.find(c => c.definition.kind === 'yokai')!;
  before.players[0].hand = null;
  before.players[0].graveyard = [{ ...yokai, zone: 'graveyard' }];
  const after = structuredClone(before);
  after.players[0].graveyard = [{ ...spell, zone: 'graveyard' }];
  after.players[0].field = [{ ...yokai, zone: 'field' }];
  expect(transitionEvents(before, after)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'move', from: 'graveyard:0', to: 'field:0:0', card: expect.objectContaining({ id: yokai.id }) }),
    expect.objectContaining({ kind: 'move', from: 'hand:0', to: 'graveyard:0', card: expect.objectContaining({ id: spell.id }) }),
  ]));
  const trapped = structuredClone(before); trapped.players[0].trap = { hidden: true };
  expect(transitionEvents(before, trapped)).toContainEqual({ kind: 'move', from: 'hand:0', to: 'trap:0', seat: 0 });
});
