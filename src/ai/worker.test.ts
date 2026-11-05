import { afterEach, expect, it, vi } from 'vitest';
import { applyCommand, createGame } from '../game/engine';
import { viewForLocalTesting, viewForPlayer } from '../game/views';
import type { GameCommand, GameView } from '../game/types';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function worker() {
  const replies: { command?: GameCommand; error?: string }[] = [];
  const scope = { onmessage: undefined as undefined | ((event: { data: GameView }) => void), postMessage: (reply: typeof replies[number]) => replies.push(reply) };
  vi.stubGlobal('self', scope);
  await import('./worker');
  return { scope, replies };
}

it('the worker returns a legal command from a private observation', async () => {
  const { scope, replies } = await worker();
  const state = createGame({ seed: 71, startingPlayer: 1 });
  scope.onmessage!({ data: viewForPlayer(state, 1) });
  expect(replies).toHaveLength(1);
  expect(replies[0].error).toBeUndefined();
  expect(() => applyCommand(state, 1, replies[0].command!)).not.toThrow();
});

it('the worker refuses an observation revealing the opposing hand', async () => {
  const { scope, replies } = await worker();
  scope.onmessage!({ data: viewForLocalTesting(createGame({ seed: 71 })) });
  expect(replies).toHaveLength(1);
  expect(replies[0].command).toBeUndefined();
  expect(replies[0].error).toMatch(/private|hidden|opponent/i);
});
