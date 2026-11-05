import { expect, it } from 'vitest';
import { reduceRoom } from './server';
import { notificationChanges, validateSubscription } from './notifications';

function game() {
  const created = reduceRoom(null, { type: 'create', matchId: 'test', name: 'Alex', tokenHash: 'host', inviteHash: 'invite', seed: 42 }).room;
  const joined = reduceRoom(created, { type: 'join', name: 'Poli', tokenHash: 'guest', inviteHash: 'invite' }).room;
  joined.state.turnPlayer = joined.state.decisionPlayer = 0;
  return { created, joined };
}

it('notifies the waiting host once when the opponent joins', () => {
  const { created, joined } = game();
  expect(notificationChanges(created, joined, 1)).toEqual([{ player: 0, body: 'Your opponent joined. It’s your turn.' }]);
  expect(notificationChanges(joined, structuredClone(joined), 1)).toEqual([]);
});

it.each(['main', 'trap', 'effect', 'turnEnd'] as const)('alerts the other decision player for %s without exposing cards', phase => {
  const { joined } = game(), next = structuredClone(joined);
  next.state.decisionPlayer = 1; next.state.phase = phase; next.state.turn++;
  next.state.pending = phase === 'effect' ? { kind: 'effect', actor: 1, source: 'trap', cardId: 'private-trap', attack: null } : null;
  const changes = notificationChanges(joined, next, 0);
  expect(changes).toHaveLength(1); expect(changes[0].player).toBe(1);
  expect(JSON.stringify(changes)).not.toMatch(/private-trap|hand|token|invite/);
  expect(notificationChanges(joined, next, 1)).toEqual([]);
});

it('does not notify about ordinary main actions, polls or game creation', () => {
  const { joined } = game(), next = structuredClone(joined);
  next.revision++; next.state.actionsUsed++;
  expect(notificationChanges(joined, next, 0)).toEqual([]);
  expect(notificationChanges(null, joined, 0)).toEqual([]);
});

it('notifies the other player of a result without leaking private state', () => {
  const { joined } = game(), next = structuredClone(joined);
  next.state.result = { winner: 1, reason: 'health' }; next.state.phase = 'finished';
  expect(notificationChanges(joined, next, 0)).toEqual([{ player: 1, body: 'You won the game.' }]);
  expect(notificationChanges(next, structuredClone(next), 0)).toEqual([]);
});

const point = btoa('046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'.match(/../g)!.map(byte => String.fromCharCode(parseInt(byte, 16))).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const subscription = { endpoint: 'https://web.push.apple.com/test', expirationTime: null, keys: { p256dh: point, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } };
it('accepts a browser subscription with a valid P-256 point', async () => {
  expect(await validateSubscription(subscription)).toEqual(subscription);
});
it.each(['http://web.push.apple.com/test', 'https://127.0.0.1/test', 'https://web.push.apple.com.evil.test/test', 'https://web.push.apple.com:444/test', 'https://user@web.push.apple.com/test'])('rejects an unsafe push endpoint %s', async endpoint => {
  await expect(validateSubscription({ ...subscription, endpoint })).rejects.toThrow(/subscription/i);
});
it.each(['bad', 'B'.repeat(87)])('rejects invalid encryption keys', async p256dh => {
  await expect(validateSubscription({ ...subscription, keys: { ...subscription.keys, p256dh } })).rejects.toThrow(/subscription/i);
});
