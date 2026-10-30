import { DurableObject } from 'cloudflare:workers';
import { RuleError } from './src/game/engine';
import { reduceRoom, ServerError, validateAction, validateName, type Room, type RoomRequest } from './src/online/server';

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
  }
  request(request: RoomRequest): string {
    try {
      return JSON.stringify(this.ctx.storage.transactionSync(() => {
        const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM room WHERE id = 1').toArray()[0];
        const current = row ? JSON.parse(row.data) as Room : null;
        const result = reduceRoom(current, request, () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
        if (result.room !== current) this.ctx.storage.sql.exec('INSERT INTO room (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(result.room));
        return { status: 200, body: result.value };
      }));
    } catch (error) { return JSON.stringify(errorReply(error)); }
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
  if (path === '/api/matches' && request.method === 'POST') {
    if (!(await env.CREATE_RATE_LIMIT.limit({ key })).success) throw new ServerError(429, 'Too many new matches. Try again in a minute.');
    const input = await body(request); fields(input, ['name', 'matchId', 'token', 'invite']); const name = validateName(input.name);
    const { matchId, token, invite } = input;
    if (typeof matchId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(matchId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof invite !== 'string' || !/^[a-f0-9]{64}$/.test(invite) || token === invite) throw new ServerError(400, 'Use random match and seat credentials.');
    const [hostHash, inviteHash] = await Promise.all([hash(token), hash(invite)]);
    const result = await roomRequest(env, matchId, { type: 'create', matchId, name, tokenHash: hostHash, inviteHash, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    return result.status === 200 ? { status: 201, body: { matchId, token, invite, snapshot: result.body } } : result;
  }
  const route = /^\/api\/matches\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/(join|commands|replay))?$/.exec(path);
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
