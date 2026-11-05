import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const vapid = { publicKey: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'), privateKey: jwk.d, subject: 'https://game.test' };
const calls = [], statuses = new Map();
const mf = new Miniflare({ ...convertV4MiniflareOptions({
  name: 'push-test', scriptPath: '.wrangler/push-test/worker.js', modules: true, compatibilityDate: '2026-10-29',
  durableObjects: { MATCHES: { className: 'MatchRoom', useSQLite: true } },
  bindings: { WEB_PUSH_VAPID: JSON.stringify(vapid) },
  ratelimits: { API_RATE_LIMIT: { namespace_id: '1', simple: { limit: 1000, period: 60 } }, CREATE_RATE_LIMIT: { namespace_id: '2', simple: { limit: 100, period: 60 } } },
  outboundService: async request => {
    assert.equal(new URL(request.url).hostname, 'fcm.googleapis.com');
    calls.push({ endpoint: request.url, headers: Object.fromEntries(request.headers), body: Buffer.from(await request.arrayBuffer()) });
    return new Response(null, { status: statuses.get(request.url) ?? 201 });
  },
}), unsafeInspectDurableObjects: true });
const credential = () => crypto.getRandomValues(new Uint8Array(32)).reduce((s, n) => s + n.toString(16).padStart(2, '0'), '');
const call = async (path, token, body, expected = 200) => {
  const response = await mf.dispatchFetch('https://game.test/api/' + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value;
};
const waitFor = async (condition, label) => {
  const deadline = Date.now() + 15000;
  while (!await condition()) { assert(Date.now() < deadline, 'Timed out: ' + label); await new Promise(resolve => setTimeout(resolve, 100)); }
};
try {
  assert.deepEqual(await call('notifications/config'), { publicKey: vapid.publicKey });
  const host = await call('matches', null, { name: 'Push host', matchId: crypto.randomUUID(), token: credential(), invite: credential() }, 201);
  const room = 'matches/' + host.matchId, pref = room + '/notifications';
  const sub = name => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/' + name, expirationTime: null, keys: { p256dh: vapid.publicKey, auth: Buffer.alloc(16).toString('base64url') } });
  const hostSub = sub('host'), guestSub = sub('guest');
  await call(pref, credential(), { type: 'save', subscription: hostSub }, 401);
  await call(pref, host.token, { type: 'save', subscription: { ...hostSub, endpoint: 'https://127.0.0.1/private' } }, 400);
  assert.deepEqual(await call(pref, host.token, { type: 'save', subscription: hostSub }), { enabled: true });
  assert.equal((await call(room, host.token)).revision, host.snapshot.revision, 'preferences must not change game revision');
  const guest = await call(room + '/join', null, { name: 'Push guest', invite: host.invite, token: credential() });
  await call(pref, guest.token, { type: 'save', subscription: hostSub }, 409);
  for (let i = 0; i < 3; i++) await call(pref, host.token, { type: 'save', subscription: sub('extra-' + i) });
  await call(pref, host.token, { type: 'save', subscription: sub('one-too-many') }, 409);
  await call(pref, host.token, { type: 'save', subscription: hostSub });
  for (let i = 0; i < 3; i++) await call(pref, host.token, { type: 'remove', endpoint: sub('extra-' + i).endpoint });
  await call(pref, guest.token, { type: 'remove', endpoint: hostSub.endpoint });
  assert.equal((await call(pref, host.token, { type: 'status', endpoint: hostSub.endpoint })).enabled, true);
  await call(pref, guest.token, { type: 'save', subscription: guestSub });
  const state = await mf.unsafeGetDurableObjectStorage('push-test', 'MatchRoom', { name: host.matchId });
  await waitFor(async () => !(await state.exec('SELECT * FROM push_queue')).length, 'join notification');
  calls.length = 0;
  await call(pref, host.token, { type: 'test', endpoint: hostSub.endpoint });
  await waitFor(() => calls.length === 1, 'test push');
  assert.equal(calls[0].headers['content-encoding'], 'aes128gcm');
  assert.match(calls[0].headers.authorization, /^vapid /); assert.equal(calls[0].body.length, 4096);
  await waitFor(async () => !(await state.exec('SELECT * FROM push_queue')).length, 'test acknowledgement');

  statuses.set(hostSub.endpoint, 500); calls.length = 0;
  await call(pref, host.token, { type: 'test', endpoint: hostSub.endpoint });
  await waitFor(async () => (await state.exec('SELECT attempts FROM push_queue'))[0]?.attempts === 1, 'durable retry');
  await mf.unsafeEvictDurableObject('push-test', 'MatchRoom', { name: host.matchId });
  statuses.set(hostSub.endpoint, 201);
  await waitFor(() => calls.length === 2, 'retry after object restart');
  await waitFor(async () => !(await state.exec('SELECT * FROM push_queue')).length, 'retry acknowledgement');

  statuses.set(hostSub.endpoint, 410);
  await call(pref, host.token, { type: 'test', endpoint: hostSub.endpoint });
  await waitFor(async () => !(await call(pref, host.token, { type: 'status', endpoint: hostSub.endpoint })).enabled, 'expired subscription cleanup');
  statuses.delete(hostSub.endpoint);
  await call(pref, host.token, { type: 'save', subscription: hostSub });
  const before = await call(room, host.token), actor = before.view.turnPlayer, tokens = [host.token, guest.token];
  const command = async (token, revision, type) => call(room + '/commands', token, { commandId: crypto.randomUUID(), expectedRevision: revision, command: { type } });
  calls.length = 0;
  const ended = await command(tokens[actor], before.revision, 'endTurn');
  const undone = await command(tokens[actor], ended.revision, 'undo');
  assert.equal((await state.exec('SELECT COUNT(*) AS n FROM push_queue'))[0].n, 0, 'Undo must cancel queued alerts');
  await new Promise(resolve => setTimeout(resolve, 3200)); assert.equal(calls.length, 0);
  const input = { commandId: crypto.randomUUID(), expectedRevision: undone.revision, command: { type: 'endTurn' } };
  await call(room + '/commands', tokens[actor], input);
  const queued = await state.exec('SELECT id FROM push_queue');
  await call(room + '/commands', tokens[actor], input);
  assert.deepEqual(await state.exec('SELECT id FROM push_queue'), queued, 'retrying a command must not queue another alert');
  await waitFor(() => calls.length === 1, 'turn alert');
  assert.equal(calls[0].endpoint, actor === 0 ? guestSub.endpoint : hostSub.endpoint);
  const privateView = JSON.stringify(await call(room, host.token));
  assert(!privateView.includes('fcm.googleapis.com') && !privateView.includes('p256dh'), 'subscriptions must stay out of game views');
  console.log('Push smoke passed: authenticated subscriptions, encrypted delivery, durable retry/restart, expired endpoint cleanup, turn alerts and Undo cancellation.');
} finally { await mf.dispose(); }
