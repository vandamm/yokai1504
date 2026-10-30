import { expect, it, vi } from 'vitest';
import { createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import type { OnlineSnapshot } from '../online/protocol';
import { OnlineSession, inviteLink, roomLocation } from './online';

const snapshot = (revision = 0): OnlineSnapshot => ({ matchId: 'room-a', revision, viewer: 0, finalized: false, waitingForOpponent: false, undoRequestedBy: null, view: viewForPlayer(createGame({ seed: 42 }), 0), openHands: false, canUndo: revision > 0, recentHistory: [] });
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

it('keeps seat credentials in storage and only an invitation in the share URL', async () => {
  const storage = memory(), fetcher = vi.fn().mockImplementation((_url: string, init: RequestInit) => { const payload = JSON.parse(init.body as string); return Promise.resolve(response({ ...payload, snapshot: { ...snapshot(), matchId: payload.matchId } })); });
  const session = new OnlineSession(storage, fetcher);
  await session.start('Host');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ name: 'Host', matchId: expect.any(String), token: expect.stringMatching(/^[a-f0-9]{64}$/), invite: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const payload = JSON.parse(fetcher.mock.calls[0][1].body), room = payload.matchId;
  expect(session.rooms()).toEqual([room]);
  const url = inviteLink('https://game.test/?session=local', room, session.invite!);
  expect(url).toBe(`https://game.test/?room=${room}#invite=${payload.invite}`);
  expect(roomLocation(url)).toEqual({ room, invite: payload.invite });
  expect(url).not.toContain(payload.token);
  const resumedFetch = vi.fn().mockResolvedValue(response({ ...snapshot(1), matchId: room }));
  const resumed = new OnlineSession(storage, resumedFetch);
  expect((await resumed.load(room))?.revision).toBe(1);
  expect(resumedFetch).toHaveBeenCalledWith(`/api/matches/${room}`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${payload.token}` }) }));
});

it('retries a lost command response with the identical command ID and revision', async () => {
  const storage = memory(), fetcher = vi.fn().mockResolvedValueOnce(response({ token: 'seat-private', snapshot: snapshot() })).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response(snapshot(1)));
  const session = new OnlineSession(storage, fetcher);
  await session.join('room-a', 'invite-secret', 'Guest');
  const command = { commandId: 'same-id', expectedRevision: 0, command: { type: 'endTurn' as const } };
  expect((await session.submit(command)).revision).toBe(1);
  expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify(command));
  expect(fetcher.mock.calls[2][1].body).toBe(fetcher.mock.calls[1][1].body);
  expect(session.pending).toBeNull();
});

it('retains an ambiguous command for explicit retry and rejects a different command', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ token: 'seat-private', snapshot: snapshot() })).mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new TypeError('offline'));
  const session = new OnlineSession(memory(), fetcher);
  await session.join('room-a', 'invite-secret', 'Guest');
  const action = { commandId: 'same-id', expectedRevision: 0, command: { type: 'endTurn' as const } };
  await expect(session.submit(action)).rejects.toThrow('connection');
  expect(session.pending).toEqual(action);
  await expect(session.submit({ ...action, commandId: 'different' })).rejects.toThrow('Retry');
  fetcher.mockResolvedValueOnce(response(snapshot(1)));
  await session.retry();
  expect(fetcher.mock.calls[3][1].body).toBe(JSON.stringify(action));
});

it('reports unavailable online hosting and does not save rejected credentials', async () => {
  const session = new OnlineSession(memory(), vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })));
  await expect(session.start('Host')).rejects.toThrow('unavailable');
  expect(session.rooms()).toEqual([]);
});

it('bounds stalled requests with a timeout', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const session = new OnlineSession(memory(), fetcher);
    const result = expect(session.start('Host')).rejects.toThrow('connection');
    await vi.advanceTimersByTimeAsync(10_001);
    await result;
  } finally { vi.useRealTimers(); }
});

it('recovers a response-lost join after reload using the same persisted credential and name', async () => {
  const storage = memory(), first = vi.fn().mockRejectedValue(new TypeError('lost response'));
  const session = new OnlineSession(storage, first);
  await expect(session.join('room-a', 'invitation', 'Original guest')).rejects.toThrow('connection');
  const original = JSON.parse(first.mock.calls[0][1].body);
  const nextFetch = vi.fn().mockResolvedValue(response({ token: original.token, snapshot: snapshot() }));
  await new OnlineSession(storage, nextFetch).load('room-a');
  expect(JSON.parse(nextFetch.mock.calls[0][1].body)).toEqual(original);
});

it('recovers a response-lost creation after reload without creating another room', async () => {
  const storage = memory(), first = vi.fn().mockRejectedValue(new TypeError('lost response'));
  await expect(new OnlineSession(storage, first).start('Host')).rejects.toThrow('connection');
  const original = JSON.parse(first.mock.calls[0][1].body);
  const nextFetch = vi.fn().mockResolvedValue(response({ ...original, snapshot: { ...snapshot(), matchId: original.matchId } }));
  expect((await new OnlineSession(storage, nextFetch).resumeCreation())?.matchId).toBe(original.matchId);
  expect(JSON.parse(nextFetch.mock.calls[0][1].body)).toEqual(original);
});

it.each(['create', 'join'] as const)('preserves a response-lost %s credential when its next retry is rate limited', async kind => {
  const storage = memory(), fetcher = vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(response({ error: 'Try later' }, 429));
  const session = new OnlineSession(storage, fetcher);
  const run = () => kind === 'create' ? session.start('Original') : session.join('room-a', 'invitation', 'Original');
  await expect(run()).rejects.toThrow('connection');
  await expect(run()).rejects.toThrow('Try later');
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  fetcher.mockResolvedValueOnce(response({ ...payload, snapshot: { ...snapshot(), matchId: kind === 'create' ? payload.matchId : 'room-a' } }));
  await run();
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(payload);
});

it('requests replay export as an authenticated state-changing operation', async () => {
  const file={format:'yokai1504-replay',version:1,actions:[]};
  const fetcher=vi.fn().mockResolvedValueOnce(response({token:'private-seat',snapshot:snapshot()})).mockResolvedValueOnce(response(file));
  const session=new OnlineSession(memory(),fetcher); await session.join('room-a','invite','Guest');
  expect(JSON.parse(await session.exportReplay())).toEqual(file);
  expect(fetcher).toHaveBeenLastCalledWith('/api/matches/room-a/replay',expect.objectContaining({method:'POST',body:'{}',headers:expect.objectContaining({Authorization:'Bearer private-seat'})}));
});
