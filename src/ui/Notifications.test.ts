import { afterEach, expect, it, vi } from 'vitest';
import { shouldOfferNotifications } from './Notifications';

afterEach(() => vi.unstubAllGlobals());

function browser(permission = 'granted', subscription: { endpoint: string } | null = { endpoint: 'https://web.push.apple.com/device' }) {
  vi.stubGlobal('Notification', { permission });
  vi.stubGlobal('PushManager', {});
  vi.stubGlobal('window', { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', { userAgent: 'Desktop', platform: 'MacIntel', maxTouchPoints: 0, serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } });
}

it('skips the offer only when this device is subscribed to this game', async () => {
  browser();
  expect(await shouldOfferNotifications({ notifications: async () => ({ enabled: true }) })).toBe(false);
  expect(await shouldOfferNotifications({ notifications: async () => ({ enabled: false }) })).toBe(true);
});

it.each(['default', 'denied'])('offers setup when notification permission is %s', async permission => {
  browser(permission);
  expect(await shouldOfferNotifications({ notifications: async () => ({ enabled: true }) })).toBe(true);
});

it('offers setup when browser permission exists but its subscription is missing', async () => {
  browser('granted', null);
  expect(await shouldOfferNotifications({ notifications: async () => ({ enabled: true }) })).toBe(true);
});

it('keeps setup available when checking the subscription fails', async () => {
  browser();
  expect(await shouldOfferNotifications({ notifications: async () => { throw new Error('Offline'); } })).toBe(true);
});

it('offers iPhone installation help before a Home Screen subscription is possible', async () => {
  browser();
  vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 });
  expect(await shouldOfferNotifications({ notifications: async () => ({ enabled: true }) })).toBe(true);
});
