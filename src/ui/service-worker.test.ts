import workerSource from '../../public/sw.js?raw';
import { expect, it } from 'vitest';

function worker() {
  const handlers: Record<string, (event: any) => void> = {}, shown: any[] = [], opened: string[] = [];
  let focused = 0;
  const self = { location: { origin: 'https://game.test' }, registration: { scope: 'https://game.test/', showNotification: async (title: string, options: any) => { shown.push({ title, ...options }); } }, clients: { claim: async () => {}, matchAll: async () => [{ url: 'https://game.test/?room=mine', focus: async () => { focused++; } }], openWindow: async (url: string) => { opened.push(url); } }, skipWaiting: async () => {}, addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; } };
  new Function('self', workerSource)(self);
  const dispatch = async (name: string, payload: any) => { let work: Promise<unknown> | undefined; handlers[name]({ ...payload, waitUntil: (promise: Promise<unknown>) => { work = promise; } }); await work; };
  return { dispatch, shown, opened, focused: () => focused };
}
it('always shows a visible notification and keeps its target in the app origin', async () => {
  const sw = worker();
  await sw.dispatch('push', { data: { json: () => ({ title: 'Yokai 1504', body: 'Your turn', url: 'https://evil.test/?token=private', tag: 'game' }) } });
  expect(sw.shown).toHaveLength(1); expect(sw.shown[0].body).toBe('Your turn');
  expect(sw.shown[0].data.url).toBe('https://game.test/');
});
it('shows a safe fallback when a push payload cannot be read', async () => {
  const sw = worker(); await sw.dispatch('push', { data: { json: () => { throw new Error('invalid'); } } });
  expect(sw.shown[0].title).toBe('Yokai 1504');
});
it('focuses the matching table and opens a different table without replacing it', async () => {
  const sw = worker(), notification = (url: string) => ({ data: { url }, close() {} });
  await sw.dispatch('notificationclick', { notification: notification('/?room=mine') });
  expect(sw.focused()).toBe(1); expect(sw.opened).toEqual([]);
  await sw.dispatch('notificationclick', { notification: notification('/?room=another') });
  expect(sw.opened).toEqual(['https://game.test/?room=another']);
  await sw.dispatch('notificationclick', { notification: notification('https://evil.test') });
  expect(sw.opened).toHaveLength(1);
  await sw.dispatch('notificationclick', { notification: notification('https://%') });
  expect(sw.opened).toHaveLength(1);
});
