/* Notifications only: game state and API responses are never cached here. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function appURL(value) {
  try {
    const scope = new URL(self.registration.scope), url = new URL(value || './', scope);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname) ? url.href : scope.href;
  } catch { return self.registration.scope; }
}
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* A visible fallback is required even for an unreadable push. */ }
  event.waitUntil(self.registration.showNotification('Yokai 1504', {
    body: typeof message.body === 'string' ? message.body.slice(0, 200) : 'Your game has an update. Open the table to continue.',
    icon: new URL('icons/app-192.png', self.registration.scope).href,
    tag: typeof message.tag === 'string' ? message.tag : 'yokai-update',
    data: { url: appURL(message.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data?.url, url = appURL(requested);
  try { if (requested && new URL(requested, self.registration.scope).origin !== self.location.origin) return; }
  catch { return; }
  event.waitUntil((async () => {
    const target = new URL(url), windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => {
      const current = new URL(client.url);
      return current.origin === target.origin && current.pathname === target.pathname && current.searchParams.get('room') === target.searchParams.get('room');
    });
    if (existing) await existing.focus();
    else await self.clients.openWindow(url);
  })());
});
