import { afterEach, expect, it, vi } from 'vitest';
import { applyCommand, createGame, previewBattle } from '../game/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Playback, battleGeometry } from './Playback';
import { viewForLocalTesting, viewForPlayer } from '../game/views';
import { playbackView, transitionEvents } from './presentation';
afterEach(() => vi.unstubAllGlobals());

it('updates health during playback while keeping the cards and phase before resolution', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const yokai = { ...before.players[0].hand![0], zone: 'field' as const };
  before.players[0].field = [yokai];
  const after = structuredClone(before);
  after.players[0].health = 12; after.players[1].health = 0;
  after.players[0].field = []; after.players[0].graveyard = [{ ...yokai, zone: 'graveyard' }];
  after.phase = 'finished'; after.result = { winner: 0, reason: 'Health reached zero.' };
  const during = playbackView(before, after);
  expect(during.players.map(player => player.health)).toEqual([12, 0]);
  expect(during.players[0].field).toEqual([yokai]);
  expect(during.players[0].graveyard).toEqual([]);
  expect(during.phase).toBe('main'); expect(during.result).toBeNull();
  expect(before.players.map(player => player.health)).toEqual([15, 15]);
});

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
  expect(html.match(/live-attack modified/g)).toHaveLength(1);
  expect(html.match(/soul-slot filled/g)).toHaveLength(1);
  expect(events.find(event => event.kind === 'attack')?.targetCard).toMatchObject({ id: kappa.id, attack: 4, souls: 1 });
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
it('keeps the attack still while the defender is deciding whether to activate a trap', () => {
  const before = viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));
  const attacker = { ...before.players[0].hand![0], zone: 'field' as const };
  before.players[0].field = [attacker];
  const pending = structuredClone(before);
  pending.phase = 'trap'; pending.pending = { kind: 'trap', actor: 1, attacker: attacker.id, target: null };
  expect(transitionEvents(before, pending, { type: 'attack', attacker: attacker.id, target: null }).some(event => event.kind === 'attack')).toBe(false);
});
it('stages a defender revived by Boseki at its field slot and includes its combat death', () => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const state = createGame({ seed: 42, startingPlayer: 0 }); state.turn = 3;
  const attacker = Object.values(state.cards).find(card => card.owner === 0 && card.def === 'tengu')!;
  const target = Object.values(state.cards).find(card => card.owner === 1 && card.def === 'kappa')!;
  const trap = Object.values(state.cards).find(card => card.owner === 1 && card.def === 'boseki')!;
  for (const player of state.players) for (const zone of ['deck', 'hand'] as const) player[zone] = player[zone].filter(id => ![attacker.id, target.id, trap.id].includes(id));
  state.players[0].field = [attacker.id]; state.players[1].graveyard = [target.id]; state.players[1].trap = trap.id;
  const pending = applyCommand(applyCommand(state, 0, { type: 'attack', attacker: attacker.id, target: null }), 1, { type: 'respond', activate: true });
  const command = { type: 'choose' as const, targets: [target.id] };
  const before = viewForPlayer(pending, 0), battle = viewForPlayer(previewBattle(pending, command)!, 0);
  const after = viewForPlayer(applyCommand(pending, 1, command), 0);
  const events = transitionEvents(before, after, command, battle);
  expect(events).toContainEqual(expect.objectContaining({ kind: 'attack', to: target.id }));
  expect(events).toContainEqual(expect.objectContaining({ kind: 'death', from: target.id }));
  const slot = { x: 20, y: 70, width: 90, height: 133 };
  const geometry = battleGeometry({ [attacker.id]: { ...slot, y: 400 }, [target.id]: { ...slot, y: 600 }, 'field:1:0': slot, 'graveyard:1': { ...slot, x: 250 } }, before, battle);
  expect(geometry[target.id]).toEqual(slot);
  const html = renderToStaticMarkup(createElement(Playback, { events, geometry, onComplete() {} }));
  expect(html).toContain('playback-attacker');
  expect(battle.players[1].field.map(card => card.id)).toContain(target.id);
  expect(battle.players[1].hand).toBeNull();
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
