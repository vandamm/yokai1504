import { expect, it } from 'vitest';
import { LocalSession, type SessionStorage } from './local';
class Storage implements SessionStorage { value: string | null = null; getItem() { return this.value; } setItem(_key: string, value: string) { this.value = value; } }
const send = async (session: LocalSession) => { const s = await session.getSnapshot(); return session.submit({ matchId: s.matchId, commandId: `command-${s.revision}`, expectedRevision: s.revision, actor: s.view.decisionPlayer, command: { type: 'endTurn' } }); };
it('exports all accepted actions including undo branches and recreates the exact current point independently', async () => {
  const storage = new Storage(), original = new LocalSession(storage, () => 'original');
  await original.start({ seed: 45, startingPlayer: 0 });
  await send(original); let s = await send(original); await original.undo(s.revision); await original.setOpenHands(true); s = await send(original);
  const raw = await original.exportReplay();
  const file = JSON.parse(raw);
  expect(file.actions).toHaveLength(2);
  expect(file.audit.map((e: { kind: string }) => e.kind)).toEqual(['command', 'command', 'undo', 'openHands', 'command']);
  const otherStorage = new Storage(), replay = new LocalSession(otherStorage, () => 'replayed');
  const restored = await replay.importReplay(raw);
  expect(restored.matchId).toBe('replayed'); expect(restored.view).toEqual(s.view); expect(restored.openHands).toBe(true);
  expect((await replay.undo(restored.revision)).view.turn).toBe(2);
  expect((await original.getSnapshot()).view.turn).toBe(3);
  expect((await new LocalSession(otherStorage).load())?.view.turn).toBe(2);
});
it('rejects modified commands, incompatible files and invalid positions without replacing a save', async () => {
  const storage = new Storage(), session = new LocalSession(storage, () => 'same'); await session.start({ seed: 42 }); await send(session);
  const file = JSON.parse(await session.exportReplay()), before = storage.value;
  file.actions[0].command = { type: 'evoke', cardId: 'missing' };
  await expect(session.importReplay(JSON.stringify(file))).rejects.toThrow(); expect(storage.value).toBe(before);
  await expect(session.importReplay('{"format":"other"}')).rejects.toThrow(); expect(storage.value).toBe(before);
});
it('exports pre-replay saves using their active undo checkpoints', async () => {
  const storage = new Storage(), session = new LocalSession(storage, () => 'old'); await session.start({ seed: 9 }); await send(session);
  const old = JSON.parse(storage.value!); delete old.audit; storage.value = JSON.stringify(old); await session.load();
  const next = new LocalSession(new Storage(), () => 'copy');
  expect((await next.importReplay(await session.exportReplay())).view).toEqual((await session.getSnapshot()).view);
});
it('opens a validated prefix for debugging and rejects an out-of-range action index', async () => {
  const session = new LocalSession(new Storage(), () => 'original'); await session.start({ seed: 42 }); await send(session); await send(session);
  const raw = await session.exportReplay(), other = new LocalSession(new Storage(), () => 'prefix');
  expect((await other.importReplay(raw, 1)).view.turn).toBe(2);
  await expect(other.importReplay(raw, 4)).rejects.toThrow(/action|range/);
});
it('reconstructs an older save where combat automatically began the next turn', async () => {
  const { applyCommand } = await import('../game/engine');
  const storage = new Storage(), session = new LocalSession(storage, () => 'legacy'); await session.start({ seed: 42, startingPlayer: 0 });
  const saved = JSON.parse(storage.value!), initial = saved.state;
  initial.turn = 3;
  const attacker = Object.values(initial.cards).find((c: any) => c.owner === 0 && c.def === 'kappa') as { id: string };
  initial.players[0].hand = initial.players[0].hand.filter((id: string) => id !== attacker.id);
  initial.players[0].deck = initial.players[0].deck.filter((id: string) => id !== attacker.id);
  initial.players[0].field = [attacker.id];
  const { history, ...position } = initial;
  const command = { attacker: attacker.id, target: null, type: 'attack' as const };
  const battle = applyCommand(initial, 0, command), final = applyCommand(battle, 0, { type: 'endTurn' });
  Object.assign(saved, { state: final, checkpoints: [{ ...position, historyLength: history.length }], revision: 1, receipts: [{ commandId: 'old-attack', acceptedRevision: 1, payload: JSON.stringify({ actor: 0, command, expectedRevision: 0, matchId: 'legacy' }) }] }); delete saved.audit;
  storage.value = JSON.stringify(saved); await session.load();
  const raw = await session.exportReplay(); expect(JSON.parse(raw).actions).toHaveLength(2);
  const other = new LocalSession(new Storage(), () => 'migrated');
  expect((await other.importReplay(raw)).view).toEqual((await session.getSnapshot()).view);
});
