import type { PlayerId } from '../game/types';
import { ServerError, type Room } from './server';

export interface WebSubscription {
  endpoint: string; expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}
export interface TurnNotification { player: PlayerId; body: string; }

export function notificationChanges(before: Room | null, after: Room, actor: PlayerId): TurnNotification[] {
  if (!before || !after.tokenHashes[1]) return [];
  const state = after.state, player = state.decisionPlayer;
  if (!before.tokenHashes[1]) return [{ player: 0, body: player === 0 ? 'Your opponent joined. It’s your turn.' : 'Your opponent joined. The game is ready.' }];
  if (state.result) return before.state.result ? [] : ([0, 1] as const).filter(id => id !== actor).map(id => ({ player: id, body: state.result!.winner === null ? 'The game ended in a draw.' : state.result!.winner === id ? 'You won the game.' : 'The game has finished. Your opponent won.' }));
  if (player === actor || before.state.turn === state.turn && before.state.decisionPlayer === player && before.state.phase === state.phase) return [];
  const body = state.phase === 'trap' ? 'Your opponent is waiting for your trap response.'
    : state.phase === 'effect' ? 'Choose how to resolve your effect.'
    : state.phase === 'turnEnd' ? 'The attack is complete. End the turn when you’re ready.' : 'It’s your turn.';
  return [{ player, body }];
}

export function validPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint), host = url.hostname;
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash &&
      (host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host === 'updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com'));
  } catch { return false; }
}
export async function validateSubscription(value: unknown): Promise<WebSubscription> {
  const fail = () => { throw new ServerError(400, 'Invalid browser push subscription.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const sub = value as Record<string, unknown>;
  if (Object.keys(sub).some(key => !['endpoint', 'expirationTime', 'keys'].includes(key)) || !validPushEndpoint(sub.endpoint) || sub.expirationTime !== undefined && sub.expirationTime !== null && (!Number.isSafeInteger(sub.expirationTime) || Number(sub.expirationTime) < 0)) return fail();
  if (!sub.keys || typeof sub.keys !== 'object' || Array.isArray(sub.keys)) return fail();
  const keys = sub.keys as Record<string, unknown>;
  if (Object.keys(keys).length !== 2 || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth)) return fail();
  try {
    const point = Uint8Array.from(atob(keys.p256dh.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
    if (point[0] !== 4) return fail();
    await crypto.subtle.importKey('raw', point, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  } catch { return fail(); }
  return { endpoint: sub.endpoint, expirationTime: sub.expirationTime as number | null ?? null, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
