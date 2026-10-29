import { expect, it } from 'vitest';
import { LocalSession } from '../session/local';
import { reduceRoom, validateAction, validateName, type RoomRequest } from './server';
import type { CardDefId, GameCommand, GameState, PlayerId } from '../game/types';
import type { OnlineCommand } from './protocol';

const host = 'host-hash', guest = 'guest-hash';
function setup() {
  let room = reduceRoom(null, { type: 'create', matchId: 'room', name: 'Host', tokenHash: host, inviteHash: 'invite-hash', seed: 42 }).room;
  const send = (request: RoomRequest) => { const result = reduceRoom(room, request); room = result.room; return result.value; };
  const join = () => send({ type: 'join', name: 'Guest', inviteHash: 'invite-hash', tokenHash: guest });
  const command = (tokenHash: string, type: 'endTurn' | 'requestUndo' | 'acceptUndo' | 'declineUndo' | 'cancelUndo', id = `id-${room!.revision}`, revision = room!.revision) => send({ type: 'command', tokenHash, action: { commandId: id, expectedRevision: revision, command: { type } as OnlineCommand } });
  return { send, join, command, get room() { return room!; } };
}

it('keeps seats fixed, hides all opponent cards and blocks play before the one-use join', () => {
  const game = setup();
  const before = game.send({ type: 'snapshot', tokenHash: host }) as any;
  expect(before.viewer).toBe(0); expect(before.waitingForOpponent).toBe(true);
  expect(before.view.players[1].hand).toBeNull(); expect(JSON.stringify(before)).not.toContain('"deck":');
  expect(() => game.command(host, 'endTurn')).toThrow(/opponent/);
  game.join();
  expect(() => game.join()).not.toThrow();
  expect(() => game.send({ type: 'join', name: 'Stranger', inviteHash: 'invite-hash', tokenHash: 'another-guest' })).toThrow(/authorized/);
  const view = game.send({ type: 'snapshot', tokenHash: guest }) as any;
  expect(view.viewer).toBe(1); expect(view.view.players[0].hand).toBeNull();
  expect(view.view.players[1].hand).toHaveLength(game.room.state.players[1].hand.length); expect(view.waitingForOpponent).toBe(false);
  expect(JSON.stringify(view)).not.toMatch(/tokenHash|inviteHash|checkpoints|receipts/);
  expect(() => game.send({ type: 'snapshot', tokenHash: 'invite-hash' })).toThrow(/authorized/);
  expect(() => reduceRoom(null, { type: 'snapshot', tokenHash: host })).toThrow(/authorized/);
});

it('recovers creation and join response loss with independent chosen credentials', () => {
  const game = setup(), create: RoomRequest = { type: 'create', matchId: 'room', name: 'Host', tokenHash: host, inviteHash: 'invite-hash', seed: 999 };
  expect(reduceRoom(game.room, create).room).toBe(game.room);
  expect(() => reduceRoom(game.room, { ...create, tokenHash: 'another-host' })).toThrow(/authorized/);
  const join: RoomRequest = { type: 'join', name: 'Guest', inviteHash: 'invite-hash', tokenHash: guest };
  game.send(join); const persisted = JSON.parse(JSON.stringify(game.room));
  expect(reduceRoom(persisted, join).room).toBe(persisted);
  expect(reduceRoom(persisted, create).room).toBe(persisted);
  expect(() => reduceRoom(persisted, { ...join, name: 'Different' })).toThrow(/authorized/);
  expect(game.room.inviteHash).toBeNull();
});

it('names the guest starter in initial history without changing a host named Opponent', () => {
  for (let seed = 0; seed < 10; seed++) {
    const created = reduceRoom(null, { type: 'create', matchId: 'room', name: 'Opponent', tokenHash: host, inviteHash: 'invite-hash', seed });
    const joined = reduceRoom(created.room, { type: 'join', name: 'Guest', tokenHash: guest, inviteHash: 'invite-hash' }).room;
    const starter = joined.state.turnPlayer === 1 ? 'Guest' : 'Opponent';
    expect(joined.state.history).toContain(`Turn 1: ${starter}.`);
    expect(joined.state.history).toContain(`${starter} draws a card.`);
    expect(joined.initial).toEqual(joined.state); expect(joined.state.players[0].name).toBe('Opponent');
  }
});

it('authenticates actors and rejects invalid or stale commands without changing the position', () => {
  const game = setup(); game.join(); const before = JSON.stringify(game.room);
  const wrong = game.room.state.decisionPlayer === 0 ? guest : host;
  expect(() => game.command(wrong, 'endTurn')).toThrow();
  expect(() => game.command(host, 'endTurn', 'stale', 0)).toThrow(/revision/);
  expect(() => game.command('invalid', 'endTurn')).toThrow(/authorized/);
  expect(JSON.stringify(game.room)).toBe(before);
  const token = game.room.state.decisionPlayer === 0 ? host : guest;
  game.command(token, 'endTurn'); expect(game.room.state.turn).toBe(2);
});

it('persists receipts across reload and accepts identical retries while rejecting changed payloads', () => {
  const game = setup(); game.join(); const actor = game.room.state.decisionPlayer === 0 ? host : guest;
  const request: RoomRequest = { type: 'command', tokenHash: actor, action: { commandId: 'retry', expectedRevision: game.room.revision, command: { type: 'endTurn' } } };
  game.send(request); const saved = JSON.stringify(game.room);
  const retry = reduceRoom(JSON.parse(saved), request);
  expect(JSON.stringify(retry.room)).toBe(saved);
  expect(() => reduceRoom(game.room, { ...request, action: { ...request.action as any, command: { type: 'requestUndo' } } })).toThrow(/reused/);
});

function relocate(state: GameState, owner: PlayerId, def: CardDefId, zone: 'field' | 'trap' | 'graveyard') {
  const card = Object.values(state.cards).find(card => card.owner === owner && card.def === def)!;
  const player = state.players[owner];
  player.hand = player.hand.filter(id => id !== card.id); player.deck = player.deck.filter(id => id !== card.id);
  if (zone === 'trap') player.trap = card.id; else player[zone].push(card.id);
  return card.id;
}
it.each(['trap', 'effect', 'turnEnd'] as const)('enforces the authenticated decision seat during %s', phase => {
  const game = setup(); game.join(); const state = game.room.state;
  state.turn = 3; state.turnPlayer = 0; state.phase = phase; state.decisionPlayer = phase === 'turnEnd' ? 0 : 1;
  let command: GameCommand = { type: 'endTurn' };
  if (phase === 'trap') {
    const attacker = relocate(state, 0, 'kappa', 'field'); relocate(state, 1, 'sake', 'trap');
    state.pending = { kind: 'trap', actor: 1, attacker, target: null }; command = { type: 'respond', activate: false };
  }
  if (phase === 'effect') {
    const cardId = relocate(state, 1, 'sake', 'graveyard'), target = relocate(state, 1, 'kappa', 'field');
    state.pending = { kind: 'effect', actor: 1, cardId, source: 'cast', attack: null };
    command = { type: 'choose', allocations: [{ cardId: target, count: 1 }] };
  }
  const action = { commandId: 'phase-action', expectedRevision: game.room.revision, command };
  const wrong = state.decisionPlayer === 0 ? guest : host, right = state.decisionPlayer === 0 ? host : guest;
  const before = JSON.stringify(game.room);
  expect(() => game.send({ type: 'command', tokenHash: wrong, action })).toThrow(/other player/);
  expect(JSON.stringify(game.room)).toBe(before);
  game.send({ type: 'command', tokenHash: right, action }); expect(game.room.revision).toBe(action.expectedRevision + 1);
});

it('requires opposite-seat undo consent, pauses moves and supports decline, cancel and acceptance', () => {
  const game = setup(); game.join(); const initial = structuredClone(game.room.state);
  game.command(game.room.state.decisionPlayer === 0 ? host : guest, 'endTurn');
  game.command(host, 'requestUndo'); const pending = JSON.stringify(game.room);
  expect(() => game.command(host, 'acceptUndo')).toThrow(/opponent/);
  expect(() => game.command(host, 'declineUndo')).toThrow(/opponent/);
  expect(() => game.command(guest, 'cancelUndo')).toThrow(/requester/);
  expect(() => game.command(game.room.state.decisionPlayer === 0 ? host : guest, 'endTurn')).toThrow(/undo/);
  expect(JSON.stringify(game.room)).toBe(pending);
  game.command(guest, 'declineUndo'); expect(game.room.undoRequestedBy).toBeNull();
  game.command(guest, 'requestUndo'); game.command(guest, 'cancelUndo');
  game.command(host, 'requestUndo'); game.command(guest, 'acceptUndo');
  expect(game.room.state).toEqual(initial); expect(game.room.actions).toHaveLength(0);
  expect(() => game.command(host, 'requestUndo')).toThrow(/undo/);
});

it('exports only a finished, authenticated replay that the local session can import after undo', async () => {
  const game = setup(); game.join();
  expect(() => game.send({ type: 'replay', tokenHash: host })).toThrow(/finished/);
  game.command(game.room.state.decisionPlayer === 0 ? host : guest, 'endTurn');
  game.command(host, 'requestUndo'); game.command(guest, 'acceptUndo');
  for (let i = 0; !game.room.state.result && i < 100; i++) game.command(game.room.state.decisionPlayer === 0 ? host : guest, 'endTurn');
  expect(game.room.state.phase).toBe('finished');
  expect(() => game.send({ type: 'replay', tokenHash: 'bad' })).toThrow(/authorized/);
  const file = game.send({ type: 'replay', tokenHash: guest });
  let saved: string | null = null;
  const session = new LocalSession({ getItem: () => saved, setItem: (_key, raw) => { saved = raw; } });
  const snapshot = await session.importReplay(JSON.stringify(file));
  expect(snapshot.view.result).toEqual(game.room.state.result);
  expect((file as any).audit.some((event: any) => event.kind === 'undo')).toBe(true);
});

it('strictly bounds and validates every untrusted action and name', () => {
  expect(validateName(' Host ')).toBe('Host');
  for (const name of ['', 'x'.repeat(25), 'a\nb', 42]) expect(() => validateName(name)).toThrow();
  const action = { commandId: 'id', expectedRevision: 0, command: { type: 'endTurn' } };
  expect(() => validateAction(action)).not.toThrow();
  for (const bad of [null, { ...action, actor: 0 }, { ...action, expectedRevision: -1 }, { ...action, commandId: 'x'.repeat(129) }, { ...action, command: { type: 'endTurn', actor: 1 } }, { ...action, command: { type: 'choose', targets: Array(31).fill('id') } }, { ...action, command: { type: 'choose', allocations: [{ cardId: 'id', count: 12 }] } }]) expect(() => validateAction(bad)).toThrow();
});
