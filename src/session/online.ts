import type { OnlineAction, OnlineCreated, OnlineJoined, OnlineSnapshot } from '../online/protocol';
import type { SessionStorage } from './local';
import { createId } from './id';

const ROOM_KEY = 'yokai-1504.online-seat.v1.';
const RECENT_KEY = 'yokai-1504.online-rooms.v1';
const CREATE_KEY = 'yokai-1504.online-create.v1';
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
interface Seat { token: string; invite?: string; pendingJoin?: { invite: string; name: string }; }
interface Creation { matchId: string; token: string; invite: string; name: string; }
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export function roomLocation(href: string): { room: string | null; invite: string | null } {
  const url = new URL(href), room = url.searchParams.get('room');
  return { room: room && /^[a-zA-Z0-9-]{1,80}$/.test(room) ? room : null, invite: new URLSearchParams(url.hash.slice(1)).get('invite') };
}
export function inviteLink(href: string, room: string, invite?: string): string {
  const url = new URL(href); url.search = ''; url.searchParams.set('room', room);
  url.hash = invite ? new URLSearchParams({ invite }).toString() : '';
  return url.href;
}

function checkedSnapshot(value: OnlineSnapshot, room?: string): OnlineSnapshot {
  const rival = value?.view?.players?.[value.viewer === 0 ? 1 : 0];
  if (!value || (value.viewer !== 0 && value.viewer !== 1) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.matchId || (room && value.matchId !== room) || value.openHands !== false || !rival || rival.hand !== null || (rival.trap !== null && !('hidden' in rival.trap))) throw new Error('The server returned an invalid private match view.');
  return value;
}

export class OnlineSession {
  private room: string | null = null;
  private seat: Seat | null = null;
  pending: OnlineAction | null = null;
  get invite(): string | undefined { return this.seat?.invite; }

  constructor(private readonly storage: SessionStorage, private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {}

  rooms(): string[] {
    try { const value: unknown = JSON.parse(this.storage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((room): room is string => typeof room === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(room)).slice(0, 8) : []; }
    catch { return []; }
  }

  private remember(room: string, seat: Seat) {
    if (!seat.token || typeof seat.token !== 'string') throw new Error('The server did not return a seat credential.');
    try {
      this.storage.setItem(ROOM_KEY + room, JSON.stringify(seat));
      this.storage.setItem(RECENT_KEY, JSON.stringify([room, ...this.rooms().filter(id => id !== room)].slice(0, 8)));
    } catch { throw new Error('Could not save your online seat. Allow browser storage before joining a room.'); }
    this.room = room; this.seat = seat; this.pending = null;
  }

  private discard(room: string) {
    this.storage.setItem(ROOM_KEY + room, 'null');
    this.storage.setItem(RECENT_KEY, JSON.stringify(this.rooms().filter(id => id !== room)));
    this.room = null; this.seat = null;
  }

  private readSeat(room: string): Seat | null {
    try { return JSON.parse(this.storage.getItem(ROOM_KEY + room) ?? 'null') as Seat | null; }
    catch { throw new Error('Could not read your saved online seat. Allow browser storage and try again.'); }
  }

  private async request<T>(path: string, body?: unknown, token?: string): Promise<T> {
    const controller = new AbortController(), timeout = globalThis.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetcher(`/api/matches${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        let detail: string | undefined;
        try { const error = await response.json(); if (typeof error.error === 'string') detail = error.error; } catch { /* Static hosting returns HTML for missing API routes. */ }
        throw new ApiError(response.status === 404 ? 'Online play is unavailable on this host, or this room no longer exists. Local testing is still available.' : detail ?? `The server could not complete this action (${response.status}).`, response.status);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new Error('The connection was interrupted. Check your connection and retry.');
    } finally { globalThis.clearTimeout(timeout); }
  }

  async start(name: string): Promise<OnlineSnapshot> {
    const pending = JSON.parse(this.storage.getItem(CREATE_KEY) ?? 'null') as Creation | null;
    const payload = pending ?? { matchId: createId(), token: secret(), invite: secret(), name: name.trim().slice(0, 24) || 'Player 1' };
    this.storage.setItem(CREATE_KEY, JSON.stringify(payload));
    this.remember(payload.matchId, { token: payload.token, invite: payload.invite });
    try {
      const result = await this.request<OnlineCreated>('', payload);
      const snapshot = checkedSnapshot(result.snapshot, payload.matchId);
      this.remember(payload.matchId, { token: result.token, invite: result.invite });
      this.storage.setItem(CREATE_KEY, 'null');
      return snapshot;
    } catch (error) {
      if (error instanceof ApiError && error.status < 500 && error.status !== 429) { this.storage.setItem(CREATE_KEY, 'null'); this.discard(payload.matchId); }
      throw error;
    }
  }

  async resumeCreation(): Promise<OnlineSnapshot | null> {
    const pending = JSON.parse(this.storage.getItem(CREATE_KEY) ?? 'null') as Creation | null;
    return pending ? this.start(pending.name) : null;
  }

  async join(room: string, invite: string, name: string): Promise<OnlineSnapshot> {
    const saved = this.readSeat(room);
    if (saved?.token && !saved.pendingJoin) return (await this.load(room))!;
    const seat = saved?.pendingJoin ? saved : { token: secret(), pendingJoin: { invite, name: name.trim().slice(0, 24) || 'Player 2' } };
    this.remember(room, seat);
    try {
      const result = await this.request<OnlineJoined>(`/${encodeURIComponent(room)}/join`, { ...seat.pendingJoin, token: seat.token });
      const snapshot = checkedSnapshot(result.snapshot, room);
      this.remember(room, { token: result.token });
      return snapshot;
    } catch (error) { if (error instanceof ApiError && error.status < 500 && error.status !== 429) this.discard(room); throw error; }
  }

  async load(room: string): Promise<OnlineSnapshot | null> {
    const creation = JSON.parse(this.storage.getItem(CREATE_KEY) ?? 'null') as Creation | null;
    if (creation?.matchId === room) return this.start(creation.name);
    const seat = this.readSeat(room);
    if (!seat?.token || typeof seat.token !== 'string') return null;
    if (seat.pendingJoin) return this.join(room, seat.pendingJoin.invite, seat.pendingJoin.name);
    const snapshot = checkedSnapshot(await this.request<OnlineSnapshot>(`/${encodeURIComponent(room)}`, undefined, seat.token), room);
    this.remember(room, seat);
    return snapshot;
  }

  async getSnapshot(): Promise<OnlineSnapshot> {
    if (!this.room || !this.seat) throw new Error('Join an online room first.');
    return checkedSnapshot(await this.request<OnlineSnapshot>(`/${encodeURIComponent(this.room)}`, undefined, this.seat.token), this.room);
  }

  async submit(action: OnlineAction): Promise<OnlineSnapshot> {
    if (!this.room || !this.seat) throw new Error('Join an online room first.');
    if (this.pending && JSON.stringify(this.pending) !== JSON.stringify(action)) throw new Error('Retry the last action before making another move.');
    this.pending = structuredClone(action);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const next = checkedSnapshot(await this.request<OnlineSnapshot>(`/${encodeURIComponent(this.room)}/commands`, this.pending, this.seat.token), this.room);
        this.pending = null;
        return next;
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) { this.pending = null; throw error; }
        if (attempt === 1) throw error;
      }
    }
    throw new Error('Retry the last action.');
  }

  async retry(): Promise<OnlineSnapshot> {
    if (!this.pending) throw new Error('There is no action to retry.');
    return this.submit(this.pending);
  }

  async exportReplay(): Promise<string> {
    if (!this.room || !this.seat) throw new Error('Join an online room first.');
    return JSON.stringify(await this.request(`/${encodeURIComponent(this.room)}/replay`, {}, this.seat.token), null, 2);
  }
}
