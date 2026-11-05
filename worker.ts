import { DurableObject } from 'cloudflare:workers';
import { RuleError } from './src/game/engine';
import { authorizedPlayer, reduceRoom, ServerError, validateAction, validateName, type Room, type RoomRequest } from './src/online/server';
import { notificationChanges, validPushEndpoint, validateSubscription, type WebSubscription } from './src/online/notifications';
import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push';

type PushRow = { endpoint: string; player: number; subscription: string; origin: string; };
type PushJob = PushRow & { id: string; payload: string; attempts: number; due: number; };
function pushKeys(env: Env): VapidKeys {
  try {
    const value = JSON.parse(env.WEB_PUSH_VAPID);
    if (typeof value.publicKey === 'string' && typeof value.privateKey === 'string' && typeof value.subject === 'string') return value;
  } catch { /* Report configuration availability without exposing credentials. */ }
  throw new ServerError(503, 'Notifications are not configured on this server yet.');
}

interface Reply { status: number; body: unknown; }
function errorReply(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof ServerError) return { status: error.status, body: { error: error.message } };
  if (error instanceof RuleError) return { status: 400, body: { error: error.message } };
  console.error('Match request failed.', error);
  return { status: 500, body: { error: 'Could not process the match. Try again.' } };
}
export class MatchRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, player INTEGER NOT NULL, subscription TEXT NOT NULL, origin TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS push_queue (endpoint TEXT PRIMARY KEY, id TEXT NOT NULL, payload TEXT NOT NULL, due INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)');
  }
  private room(): Room | null {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM room WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) as Room : null;
  }
  private queue(sub: PushRow, matchId: string, body: string, delay = 3000) {
    const payload = JSON.stringify({ title: 'Yokai 1504', body, url: `${sub.origin}/?room=${matchId}`, tag: `yokai-${matchId}` });
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO push_queue (endpoint, id, payload, due, attempts) VALUES (?, ?, ?, ?, 0)', sub.endpoint, crypto.randomUUID(), payload, Date.now() + delay);
  }
  private async schedulePush() {
    const next = this.ctx.storage.sql.exec<{ due: number | null }>('SELECT MIN(due) AS due FROM push_queue').one().due;
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async request(request: RoomRequest): Promise<string> {
    try {
      return JSON.stringify(await this.ctx.storage.transaction(async () => {
        const current = this.room();
        const result = reduceRoom(current, request, () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
        if (result.room !== current) this.ctx.storage.sql.exec('INSERT INTO room (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(result.room));
        if (result.room !== current && (request.type === 'command' || request.type === 'join')) {
          this.ctx.storage.sql.exec('DELETE FROM push_queue');
          const actor = request.type === 'join' ? 1 : authorizedPlayer(result.room, request.tokenHash);
          for (const change of notificationChanges(current, result.room, actor)) {
            for (const sub of this.ctx.storage.sql.exec<PushRow>('SELECT * FROM push_subscriptions WHERE player = ?', change.player).toArray()) this.queue(sub, result.room.matchId, change.body);
          }
          await this.schedulePush();
        }
        return { status: 200, body: result.value };
      }));
    } catch (error) { return JSON.stringify(errorReply(error)); }
  }
  async notifications(token: string, operation: string, endpoint: string, origin: string, subscription?: WebSubscription): Promise<string> {
    try {
      return JSON.stringify(await this.ctx.storage.transaction(async () => {
        const room = this.room(), player = authorizedPlayer(room, token);
        const existing = this.ctx.storage.sql.exec<PushRow>('SELECT * FROM push_subscriptions WHERE endpoint = ? AND player = ?', endpoint, player).toArray()[0];
        if (operation === 'save' && subscription) {
          const owner = this.ctx.storage.sql.exec<PushRow>('SELECT * FROM push_subscriptions WHERE endpoint = ?', endpoint).toArray()[0];
          if (owner && owner.player !== player) throw new ServerError(409, 'This device is already registered for the other seat.');
          const count = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM push_subscriptions WHERE player = ?', player).one().count;
          if (!existing && count >= 4) throw new ServerError(409, 'Notifications are already registered on four devices for this seat.');
          this.ctx.storage.sql.exec('INSERT OR REPLACE INTO push_subscriptions (endpoint, player, subscription, origin) VALUES (?, ?, ?, ?)', endpoint, player, JSON.stringify(subscription), origin);
        } else if (operation === 'remove') {
          if (existing) { this.ctx.storage.sql.exec('DELETE FROM push_queue WHERE endpoint = ?', endpoint); this.ctx.storage.sql.exec('DELETE FROM push_subscriptions WHERE endpoint = ? AND player = ?', endpoint, player); }
          await this.schedulePush();
        } else if (operation === 'test') {
          if (!existing) throw new ServerError(409, 'Enable notifications for this game first.');
          this.queue(existing, room!.matchId, 'Notifications are working on this device.', 1);
          await this.schedulePush();
        }
        return { status: 200, body: { enabled: operation === 'save' || operation !== 'remove' && !!existing } };
      }));
    } catch (error) { return JSON.stringify(errorReply(error)); }
  }
  async alarm(): Promise<void> {
    const jobs = this.ctx.storage.sql.exec<PushJob>('SELECT q.*, s.player, s.subscription, s.origin FROM push_queue q JOIN push_subscriptions s USING(endpoint) WHERE q.due <= ?', Date.now()).toArray();
    for (const job of jobs) {
      if (!this.ctx.storage.sql.exec('SELECT id FROM push_queue WHERE endpoint = ? AND id = ?', job.endpoint, job.id).toArray().length) continue;
      let status = 0;
      let stage = 'encrypt';
      try {
        const payload = await buildPushPayload({ data: JSON.parse(job.payload), options: { ttl: 300, urgency: 'normal' } }, JSON.parse(job.subscription), pushKeys(this.env));
        stage = 'send';
        const response = await fetch(job.endpoint, { ...payload, body: new Uint8Array(payload.body), redirect: 'manual', signal: AbortSignal.timeout(10000) });
        status = response.status; await response.body?.cancel();
      } catch (error) { console.warn('Push delivery will retry.', { player: job.player, attempt: job.attempts + 1, stage, error: error instanceof Error ? error.name : 'Unknown' }); }
      if (status === 404 || status === 410) {
        this.ctx.storage.sql.exec('DELETE FROM push_subscriptions WHERE endpoint = ?', job.endpoint);
        this.ctx.storage.sql.exec('DELETE FROM push_queue WHERE endpoint = ?', job.endpoint);
      } else if (status >= 200 && status < 300 || job.attempts >= 6) {
        this.ctx.storage.sql.exec('DELETE FROM push_queue WHERE endpoint = ? AND id = ?', job.endpoint, job.id);
      } else {
        this.ctx.storage.sql.exec('UPDATE push_queue SET attempts = attempts + 1, due = ? WHERE endpoint = ? AND id = ?', Date.now() + Math.min(300000, 5000 * 2 ** job.attempts), job.endpoint, job.id);
      }
    }
    await this.schedulePush();
  }
}
async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('Content-Length')) > 4096) throw new ServerError(413, 'The request is too large.');
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ServerError(400, 'Send a JSON request.');
  const reader = request.body?.getReader(); if (!reader) throw new ServerError(400, 'A request body is required.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new ServerError(413, 'The request is too large.'); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new ServerError(400, 'Invalid JSON request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServerError(400, 'Invalid request.');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, names: string[]) {
  if (Object.keys(value).length !== names.length || names.some(key => !Object.hasOwn(value, key))) throw new ServerError(400, 'Unexpected or missing fields.');
}
async function tokenHash(request: Request): Promise<string> {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new ServerError(401, 'Not authorized.');
  return hash(token);
}
async function roomRequest(env: Env, matchId: string, request: RoomRequest): Promise<Reply> {
  return JSON.parse(await env.MATCHES.getByName(matchId).request(request)) as Reply;
}
async function api(request: Request, env: Env): Promise<Reply> {
  const path = new URL(request.url).pathname;
  const key = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!(await env.API_RATE_LIMIT.limit({ key })).success) throw new ServerError(429, 'Too many requests. Try again in a minute.');
  if (path === '/api/notifications/config' && request.method === 'GET') return { status: 200, body: { publicKey: pushKeys(env).publicKey } };
  if (path === '/api/matches' && request.method === 'POST') {
    if (!(await env.CREATE_RATE_LIMIT.limit({ key })).success) throw new ServerError(429, 'Too many new matches. Try again in a minute.');
    const input = await body(request); fields(input, ['name', 'matchId', 'token', 'invite']); const name = validateName(input.name);
    const { matchId, token, invite } = input;
    if (typeof matchId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(matchId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof invite !== 'string' || !/^[a-f0-9]{64}$/.test(invite) || token === invite) throw new ServerError(400, 'Use random match and seat credentials.');
    const [hostHash, inviteHash] = await Promise.all([hash(token), hash(invite)]);
    const result = await roomRequest(env, matchId, { type: 'create', matchId, name, tokenHash: hostHash, inviteHash, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    return result.status === 200 ? { status: 201, body: { matchId, token, invite, snapshot: result.body } } : result;
  }
  const route = /^\/api\/matches\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/(join|commands|replay|notifications))?$/.exec(path);
  if (!route) return { status: 404, body: { error: 'Not found.' } };
  const [, matchId, operation] = route;
  if (operation === 'join' && request.method === 'POST') {
    const input = await body(request); fields(input, ['name', 'invite', 'token']); const name = validateName(input.name);
    if (typeof input.invite !== 'string' || !/^[a-f0-9]{64}$/.test(input.invite)) throw new ServerError(401, 'Not authorized.');
    if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token) || input.token === input.invite) throw new ServerError(400, 'Use a separate random seat credential.');
    const token = input.token, result = await roomRequest(env, matchId, { type: 'join', name, tokenHash: await hash(token), inviteHash: await hash(input.invite) });
    return result.status === 200 ? { status: 200, body: { token, snapshot: result.body } } : result;
  }
  const credential = await tokenHash(request);
  if (operation === 'notifications' && request.method === 'POST') {
    pushKeys(env);
    const input = await body(request);
    const save = input.type === 'save';
    fields(input, save ? ['type', 'subscription'] : ['type', 'endpoint']);
    if (!['save', 'remove', 'status', 'test'].includes(input.type as string)) throw new ServerError(400, 'Invalid notification action.');
    const subscription = save ? await validateSubscription(input.subscription) : undefined;
    const endpoint = subscription?.endpoint ?? input.endpoint;
    if (!validPushEndpoint(endpoint)) throw new ServerError(400, 'Invalid browser push subscription.');
    return JSON.parse(await env.MATCHES.getByName(matchId).notifications(credential, input.type as string, endpoint, new URL(request.url).origin, subscription));
  }
  if (operation === 'commands' && request.method === 'POST') {
    const action = await body(request); validateAction(action);
    return roomRequest(env, matchId, { type: 'command', tokenHash: credential, action });
  }
  if (!operation && request.method === 'GET') return roomRequest(env, matchId, { type: 'snapshot', tokenHash: credential });
  if (operation === 'replay' && (request.method === 'POST' || request.method === 'GET')) {
    if (request.method === 'POST') fields(await body(request), []);
    // Keep GET for older clients; every export finalizes before revealing either deck.
    return roomRequest(env, matchId, { type: 'replay', tokenHash: credential });
  }
  return { status: 405, body: { error: 'Method not allowed.' } };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    let reply: Reply;
    try { reply = await api(request, env); } catch (error) { reply = errorReply(error); }
    return Response.json(reply.body, { status: reply.status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...(reply.status === 429 ? { 'Retry-After': '60' } : {}) } });
  },
};
