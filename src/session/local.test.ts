import { describe, expect, it } from 'vitest';
import { LocalSession, SAVE_KEY, type SessionStorage } from './local';
import type { CardDefId, GameCommand, GameState, PlayerId } from '../game/types';

class MemoryStorage implements SessionStorage {
  value: string | null = null;
  fail = false;
  getItem() { return this.value; }
  setItem(_key: string, value: string) {
    if (this.fail) throw new Error('Storage is full');
    this.value = value;
  }
}

const begin = async (openHands = false) => {
  const storage = new MemoryStorage();
  const session = new LocalSession(storage, () => 'match-one');
  const snapshot = await session.start({ seed: 42, startingPlayer: 0, names: ['Aki', 'Ren'], openHands });
  return { storage, session, snapshot };
};

function submit(session: LocalSession, revision: number, commandId = `command-${revision}`, command: GameCommand = { type: 'endTurn' }, actor: PlayerId = 0) {
  return session.submit({ matchId: 'match-one', commandId, expectedRevision: revision, actor, command });
}

function move(state: GameState, definition: CardDefId, owner: PlayerId, zone: 'hand' | 'field' | 'graveyard' | 'trap') {
  const card = Object.values(state.cards).find(card => card.def === definition && card.owner === owner)!;
  for (const seat of state.players) {
    for (const name of ['deck', 'hand', 'field', 'graveyard'] as const) seat[name] = seat[name].filter(id => id !== card.id);
    if (seat.trap === card.id) seat.trap = null;
  }
  if (zone === 'trap') state.players[owner].trap = card.id;
  else state.players[owner][zone].push(card.id);
  return card.id;
}

async function battleFixture(trap: boolean) {
  const { session, storage } = await begin();
  const saved = JSON.parse(storage.value!);
  const state = saved.state as GameState;
  state.turn = 3;
  const attacker = move(state, 'kappa', 0, 'field');
  if (trap) move(state, 'sake', 1, 'trap');
  else state.players[1].health = 1;
  storage.value = JSON.stringify(saved);
  const initial = await session.load();
  return { session, storage, attacker, initial };
}

describe('LocalSession', () => {
  it('loads no match from empty storage and saves a private initial game', async () => {
    const storage = new MemoryStorage();
    const session = new LocalSession(storage, () => 'match-one');
    expect(await session.load()).toBeNull();
    await expect(session.getSnapshot()).rejects.toThrow(/start|load|match/i);
    const initial = await session.start({ seed: 42, startingPlayer: 0, names: ['Aki', 'Ren'] });
    expect(initial).toMatchObject({ matchId: 'match-one', revision: 0, openHands: false, canUndo: false });
    expect(initial.view.players[0].name).toBe('Aki');
    expect(initial.view.players[0].hand).toHaveLength(5);
    expect(initial.view.players[1].hand).toBeNull();
    expect(SAVE_KEY).toBeTruthy();
    expect(storage.value).not.toBeNull();
    expect(await new LocalSession(storage).load()).toEqual(initial);
  });

  it('accepts one action, saves it, and gives the next decision maker a private view', async () => {
    const { session, storage } = await begin();
    const next = await submit(session, 0);
    expect(next).toMatchObject({ revision: 1, canUndo: true });
    expect(next.view.decisionPlayer).toBe(1);
    expect(next.view.players[0].hand).toBeNull();
    expect(next.view.players[1].hand).toHaveLength(5);
    expect(await new LocalSession(storage).load()).toEqual(next);
  });

  it('returns current state for an exact duplicate before rejecting its old revision', async () => {
    const { session, storage } = await begin();
    await submit(session, 0, 'first');
    const current = await submit(session, 1, 'second', { type: 'endTurn' }, 1);
    const saved = storage.value;
    expect(await submit(session, 0, 'first')).toEqual(current);
    expect(storage.value).toBe(saved);
  });

  it('retains duplicate receipts after undo and refresh, without reapplying an undone command', async () => {
    const { session, storage, snapshot } = await begin();
    await submit(session, 0, 'first');
    const undone = await session.undo(1);
    expect(undone.revision).toBe(2);
    expect(undone.view).toEqual(snapshot.view);
    const reloaded = new LocalSession(storage);
    await reloaded.load();
    expect(await submit(reloaded, 0, 'first')).toEqual(undone);
    expect(await submit(reloaded, 2, 'branch')).toMatchObject({ revision: 3, canUndo: true });
  });

  it('rejects a reused command ID with changed intent, actor, or revision', async () => {
    const { session, storage } = await begin();
    await submit(session, 0, 'first');
    const saved = storage.value;
    await expect(submit(session, 0, 'first', { type: 'respond', activate: false })).rejects.toThrow(/reused|different|payload/i);
    await expect(submit(session, 0, 'first', { type: 'endTurn' }, 1)).rejects.toThrow(/reused|different|payload/i);
    await expect(submit(session, 1, 'first')).rejects.toThrow(/reused|different|payload/i);
    expect(storage.value).toBe(saved);
  });

  it('rejects stale, wrong-match, wrong-actor and illegal commands without a checkpoint', async () => {
    const { session, storage, snapshot } = await begin();
    const saved = storage.value;
    await expect(submit(session, 2)).rejects.toThrow(/revision|stale/i);
    await expect(session.submit({ matchId: 'other', commandId: 'x', expectedRevision: 0, actor: 0, command: { type: 'endTurn' } })).rejects.toThrow(/match/i);
    await expect(submit(session, 0, 'wrong-actor', { type: 'endTurn' }, 1)).rejects.toThrow();
    await expect(submit(session, 0, 'missing', { type: 'play', cardId: 'missing' })).rejects.toThrow();
    expect(await session.getSnapshot()).toEqual(snapshot);
    expect(storage.value).toBe(saved);
    await expect(session.undo(0)).rejects.toThrow(/undo|action/i);
  });

  it('undo restores complete positions and deck order through refresh and repeated turns', async () => {
    const { session, storage, snapshot } = await begin();
    const initialState = JSON.parse(storage.value!).state;
    const first = await submit(session, 0, 'first');
    await submit(session, 1, 'second', { type: 'endTurn' }, 1);
    const reloaded = new LocalSession(storage);
    await reloaded.load();
    expect((await reloaded.undo(2)).view).toEqual(first.view);
    expect((await reloaded.undo(3)).view).toEqual(snapshot.view);
    expect(JSON.parse(storage.value!).state).toEqual(initialState);
    expect(await reloaded.getSnapshot()).toMatchObject({ revision: 4, canUndo: false });
    await expect(reloaded.undo(4)).rejects.toThrow(/undo|action/i);
  });

  it('keeps history once and checkpoints free of nested undo/receipt/history copies', async () => {
    const { session, storage } = await begin();
    await submit(session, 0);
    await submit(session, 1, 'second', { type: 'endTurn' }, 1);
    const saved = JSON.parse(storage.value!);
    expect(saved.checkpoints).toHaveLength(2);
    for (const checkpoint of saved.checkpoints) {
      expect(checkpoint).not.toHaveProperty('history');
      expect(checkpoint).not.toHaveProperty('checkpoints');
      expect(checkpoint).not.toHaveProperty('receipts');
      expect(checkpoint.historyLength).toBeTypeOf('number');
    }
  });

  it('persists open hands as a preference across undo and reload, without a checkpoint', async () => {
    const { session, storage, snapshot } = await begin();
    const open = await session.setOpenHands(true);
    expect(open).toMatchObject({ openHands: true, revision: 1, canUndo: false });
    expect(open.view.players.every(player => player.hand !== null)).toBe(true);
    expect(open.view).not.toHaveProperty('cards');
    expect(open.view.players[0]).not.toHaveProperty('deck');
    const unchanged = await session.setOpenHands(true);
    expect(unchanged).toEqual(open);
    await submit(session, 1);
    const undone = await session.undo(2);
    expect(undone.openHands).toBe(true);
    expect(undone.canUndo).toBe(false);
    expect(await new LocalSession(storage).load()).toEqual(undone);
    const privateAgain = await session.setOpenHands(false);
    expect(privateAgain.view).toEqual(snapshot.view);
    expect(privateAgain.revision).toBe(4);
  });

  it('starts directly in open-hands mode when requested', async () => {
    const { snapshot } = await begin(true);
    expect(snapshot.openHands).toBe(true);
    expect(snapshot.view.players.every(player => player.hand !== null)).toBe(true);
  });

  it('preserves previous accepted state when command, undo, preference, or restart storage writes fail', async () => {
    const { session, storage, snapshot } = await begin();
    storage.fail = true;
    await expect(submit(session, 0, 'first')).rejects.toThrow(/save|storage/i);
    expect(await session.getSnapshot()).toEqual(snapshot);
    storage.fail = false;
    const first = await submit(session, 0, 'first');
    const saved = storage.value;
    storage.fail = true;
    await expect(session.undo(1)).rejects.toThrow(/save|storage/i);
    await expect(session.setOpenHands(true)).rejects.toThrow(/save|storage/i);
    await expect(session.start({ seed: 2 })).rejects.toThrow(/save|storage/i);
    expect(await session.getSnapshot()).toEqual(first);
    expect(storage.value).toBe(saved);
  });

  it('rejects writes from an older tab, including undo, preferences and restart', async () => {
    const { session, storage } = await begin();
    await submit(session, 0);
    const other = new LocalSession(storage);
    await other.load();
    await submit(other, 1, 'other', { type: 'endTurn' }, 1);
    const saved = storage.value;
    await expect(submit(session, 1, 'stale', { type: 'endTurn' }, 1)).rejects.toThrow(/tab|elsewhere|stale/i);
    await expect(session.undo(1)).rejects.toThrow(/tab|elsewhere|stale/i);
    await expect(session.setOpenHands(true)).rejects.toThrow(/tab|elsewhere|stale/i);
    await expect(session.start({ seed: 10 })).rejects.toThrow(/tab|elsewhere|stale/i);
    expect(storage.value).toBe(saved);
    expect((await session.load())!.revision).toBe(2);
  });

  it('does not expose mutable references into accepted state', async () => {
    const { session, snapshot } = await begin();
    snapshot.view.players[0].health = 0;
    snapshot.view.history.push('invented');
    expect((await session.getSnapshot()).view.players[0].health).toBe(15);
    expect((await session.getSnapshot()).view.history).not.toContain('invented');
  });

  it('resumes and undoes trap response and effect allocation decisions with the correct actor', async () => {
    const { session, storage, attacker, initial } = await battleFixture(true);
    const trap = await submit(session, 0, 'attack', { type: 'attack', attacker, target: null });
    expect(trap.view).toMatchObject({ phase: 'trap', decisionPlayer: 1 });
    const reloaded = new LocalSession(storage);
    expect(await reloaded.load()).toEqual(trap);
    const effect = await submit(reloaded, 1, 'respond', { type: 'respond', activate: true }, 1);
    expect(effect.view).toMatchObject({ phase: 'effect', decisionPlayer: 1 });
    const again = new LocalSession(storage);
    expect(await again.load()).toEqual(effect);
    await expect(submit(again, 2, 'wrong-choose', { type: 'choose', allocations: [] }, 0)).rejects.toThrow();
    await submit(again, 2, 'choose', { type: 'choose', allocations: [{ cardId: attacker, count: 1 }] }, 1);
    expect((await again.undo(3)).view).toEqual(effect.view);
    expect((await again.undo(4)).view).toEqual(trap.view);
    expect((await again.undo(5)).view).toEqual(initial!.view);
    expect((await again.getSnapshot()).revision).toBe(6);
  });

  it('can decline, undo and choose a different trap response', async () => {
    const { session, attacker } = await battleFixture(true);
    const trap = await submit(session, 0, 'attack', { type: 'attack', attacker, target: null });
    await submit(session, 1, 'decline', { type: 'respond', activate: false }, 1);
    expect((await session.undo(2)).view).toEqual(trap.view);
    const alternative = await submit(session, 3, 'activate', { type: 'respond', activate: true }, 1);
    expect(alternative.view.phase).toBe('effect');
    expect(await submit(session, 1, 'decline', { type: 'respond', activate: false }, 1)).toEqual(alternative);
  });

  it('preserves undo after a lethal result and refresh', async () => {
    const { session, storage, attacker, initial } = await battleFixture(false);
    const result = await submit(session, 0, 'attack', { type: 'attack', attacker, target: null });
    expect(result.view.phase).toBe('finished');
    expect(result.view.result?.winner).toBe(0);
    const reloaded = new LocalSession(storage);
    expect(await reloaded.load()).toEqual(result);
    expect((await reloaded.undo(1)).view).toEqual(initial!.view);
  });

  it('reports storage read failures and allows explicit replacement of a corrupt save', async () => {
    const inaccessible = new LocalSession({ getItem() { throw new Error('blocked'); }, setItem() {} });
    await expect(inaccessible.load()).rejects.toThrow(/storage/i);
    const { storage } = await begin();
    storage.value = '{broken';
    const session = new LocalSession(storage, () => 'replacement');
    await expect(session.load()).rejects.toThrow(/saved/i);
    expect((await session.start({ seed: 13 })).matchId).toBe('replacement');
  });

  it('rejects malformed command payloads before saving', async () => {
    const { session, storage, snapshot } = await begin();
    const saved = storage.value;
    await expect(submit(session, 0, 'malformed', { type: 'respond', activate: 'yes' } as unknown as GameCommand)).rejects.toThrow(/response/i);
    await expect(submit(session, 0, 'unknown', { type: 'endTurn', hidden: true } as unknown as GameCommand)).rejects.toThrow(/fields/i);
    await expect(session.submit({ matchId: 'match-one', commandId: 'extra', expectedRevision: 0, actor: 0, command: { type: 'endTurn' }, extra: true } as any)).rejects.toThrow(/fields/i);
    expect(storage.value).toBe(saved);
    expect(await session.getSnapshot()).toEqual(snapshot);
  });
});

describe('saved position validation', () => {
  it.each(['kozuchi', 'boseki', 'ougi', 'hamaya', 'karakasa-kozo', 'nekomata'] as const)('rejects an unfinishable pending %s without changing the accepted match or storage', async definition => {
    const { session, storage, snapshot } = await begin();
    const saved = JSON.parse(storage.value!);
    const state = saved.state as GameState;
    const release = definition === 'karakasa-kozo' || definition === 'nekomata';
    const cardId = move(state, definition, 0, release ? 'field' : 'graveyard');
    state.phase = 'effect';
    state.actionsUsed = release ? 0 : 1;
    state.pending = { kind: 'effect', actor: 0, cardId, source: release ? 'release' : 'cast', attack: null };
    storage.value = JSON.stringify(saved);
    const corrupt = storage.value;
    await expect(session.load()).rejects.toThrow(/saved.*effect|saved.*choice/i);
    expect(await session.getSnapshot()).toEqual(snapshot);
    expect(storage.value).toBe(corrupt);
    const fresh = new LocalSession(storage);
    await expect(fresh.load()).rejects.toThrow(/saved.*effect|saved.*choice/i);
    await expect(fresh.getSnapshot()).rejects.toThrow(/start|load|match/i);
  });

  it.each(['sake', 'jufu'] as const)('resumes a pending %s that can choose zero targets', async definition => {
    const { session, storage } = await begin();
    const saved = JSON.parse(storage.value!);
    const cardId = move(saved.state, definition, 0, 'hand');
    storage.value = JSON.stringify(saved);
    await session.load();
    const pending = await submit(session, 0, 'cast', { type: 'play', cardId });
    expect(pending.view.phase).toBe('effect');
    const resumed = new LocalSession(storage);
    expect(await resumed.load()).toEqual(pending);
    expect((await submit(resumed, 1, 'choose-zero', { type: 'choose' })).view.phase).toBe('main');
  });

  it.each(['karakasa-kozo', 'nekomata'] as const)('resumes a legal %s release after its last soul was already paid', async definition => {
    const { session, storage } = await begin();
    const saved = JSON.parse(storage.value!);
    const state = saved.state as GameState;
    const cardId = move(state, definition, 0, 'field');
    const target = definition === 'karakasa-kozo' ? move(state, 'sake', 1, 'trap') : move(state, 'kappa', 1, 'field');
    state.cards[cardId].souls = 1;
    state.supply = 10;
    storage.value = JSON.stringify(saved);
    await session.load();
    const pending = await submit(session, 0, 'release', { type: 'release', cardId });
    expect(pending.view.phase).toBe('effect');
    expect(JSON.parse(storage.value!).state.cards[cardId].souls).toBe(0);
    const resumed = new LocalSession(storage);
    expect(await resumed.load()).toEqual(pending);
    expect((await submit(resumed, 1, 'choose-target', { type: 'choose', targets: [target] })).view.phase).toBe('main');
  });

  it('reports invalid JSON and incompatible schema without erasing the saved match', async () => {
    const { storage } = await begin();
    for (const invalid of ['{bad json', JSON.stringify({ schemaVersion: 99 })]) {
      storage.value = invalid;
      await expect(new LocalSession(storage).load()).rejects.toThrow(/saved|version|restart/i);
      expect(storage.value).toBe(invalid);
    }
  });

  const corruptions: [string, (saved: any) => void][] = [
    ['duplicate card zone', saved => saved.state.players[0].hand.push(saved.state.players[0].deck[0])],
    ['missing card', saved => saved.state.players[0].deck.pop()],
    ['unknown definition', saved => Object.values(saved.state.cards).forEach((card: any) => card.def = 'unknown')],
    ['wrong ownership', saved => (Object.values(saved.state.cards)[0] as any).owner = 4],
    ['wrong catalog composition', saved => (Object.values(saved.state.cards)[0] as any).def = (Object.values(saved.state.cards)[1] as any).def],
    ['broken supply conservation', saved => saved.state.supply = 10],
    ['soul over cap', saved => (Object.values(saved.state.cards)[0] as any).souls = 12],
    ['invalid phase', saved => saved.state.phase = 'battling'],
    ['pending decision mismatch', saved => saved.state.phase = 'trap'],
    ['wrong decision maker', saved => saved.state.decisionPlayer = 1],
    ['malformed history', saved => saved.state.history.push({ hidden: 'card' })],
    ['finished without result', saved => saved.state.phase = 'finished'],
    ['invalid result winner', saved => { saved.state.phase = 'finished'; saved.state.result = { winner: 2, reason: 'test' }; }],
    ['fractional revision', saved => saved.revision = 0.5],
    ['invalid preferences', saved => saved.openHands = 'yes'],
    ['invalid checkpoint', saved => saved.checkpoints.push({ historyLength: -1 })],
    ['invalid receipt', saved => saved.receipts.push({ commandId: 'invalid', acceptedRevision: 0, payload: '{}' })],
    ['invalid health', saved => saved.state.players[0].health = -1],
    ['invalid action budget', saved => saved.state.actionsUsed = 3],
    ['future summon', saved => (Object.values(saved.state.cards)[0] as any).summonedTurn = saved.state.turn + 1],
    ['card map identity mismatch', saved => (Object.values(saved.state.cards)[0] as any).id = 'other'],
    ['invalid rules version', saved => saved.state.rulesVersion = 2],
    ['invalid catalog version', saved => saved.catalogVersion = 2],
  ];
  it.each(corruptions)('rejects %s without silently resetting', async (_description, corrupt) => {
    const { storage } = await begin();
    const saved = JSON.parse(storage.value!);
    corrupt(saved);
    storage.value = JSON.stringify(saved);
    await expect(new LocalSession(storage).load()).rejects.toThrow(/saved|invalid|restart/i);
    expect(storage.value).toBe(JSON.stringify(saved));
  });

  it('validates older checkpoints rather than allowing corruption to reappear on undo', async () => {
    const { storage, session } = await begin();
    await submit(session, 0);
    const saved = JSON.parse(storage.value!);
    saved.checkpoints[0].supply = 0;
    storage.value = JSON.stringify(saved);
    await expect(new LocalSession(storage).load()).rejects.toThrow(/saved|invalid|restart/i);
  });
});
