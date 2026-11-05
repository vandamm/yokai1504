import { useEffect, useState } from 'react';
import type { OnlineSession } from '../session/online';
import { publicAsset } from './assets';

export function InstallHelp() {
  return <details className="install-help"><summary>Add to Home Screen</summary><p>On iPhone, open this site in Safari. Use Share → Add to Home Screen (under More if needed), keep Open as Web App enabled, then tap Add.</p><p>Open the app from its new icon before starting or joining a game. Tap the bell at the table to enable notifications. This needs iOS 16.4 or later.</p><p>Seats stay in the browser or installed app where you joined. On desktop, use your browser’s Install app option.</p></details>;
}

function unavailable() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (ios && !window.matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone) return 'On iPhone, add the game to your Home Screen and open it from its icon before enabling notifications.';
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'This browser does not support background notifications. Try Safari on an installed iPhone app, or a supported desktop browser.';
  return null;
}

export async function shouldOfferNotifications(session: Pick<OnlineSession, 'notifications'>): Promise<boolean> {
  if (unavailable() || Notification.permission !== 'granted') return true;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return !subscription || !(await session.notifications({ type: 'status', endpoint: subscription.endpoint })).enabled;
  } catch { return true; }
}

export function Notifications({ session }: { session: OnlineSession }) {
  const [reason] = useState(unavailable);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [publicKey, setPublicKey] = useState<string>();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [denied, setDenied] = useState(!reason && Notification.permission === 'denied');
  useEffect(() => {
    if (reason) return;
    let live = true;
    void (async () => {
      try {
        const [response] = await Promise.all([fetch('/api/notifications/config', { signal: AbortSignal.timeout(10000), cache: 'no-store' }), navigator.serviceWorker.register(publicAsset('sw.js'))]);
        const config = await response.json();
        if (!response.ok || typeof config.publicKey !== 'string') throw new Error(config.error || 'Notifications are unavailable.');
        const ready = await navigator.serviceWorker.ready, current = await ready.pushManager.getSubscription();
        const status = current ? await session.notifications({ type: 'status', endpoint: current.endpoint }) : { enabled: false };
        if (live) { setRegistration(ready); setPublicKey(config.publicKey); setSubscription(current); setEnabled(status.enabled); }
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not prepare notifications.'); }
    })();
    return () => { live = false; };
  }, [reason, session]);
  const enable = async () => {
    if (!registration || !publicKey || busy) return;
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
      const current = subscription ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      setSubscription(current);
      await session.notifications({ type: 'save', subscription: current.toJSON() });
      setEnabled(true); setMessage('Enabled on this device for this game.');
    } catch (reason) { setDenied(Notification.permission === 'denied'); setError(reason instanceof Error ? reason.message : 'Could not enable notifications.'); }
    finally { setBusy(false); }
  };
  const action = async (type: 'test' | 'remove') => {
    if (!subscription || busy) return;
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      await session.notifications({ type, endpoint: subscription.endpoint });
      if (type === 'remove') { setEnabled(false); setMessage('Turn alerts are off for this game on this device.'); }
      else setMessage('Test sent. Look for a system notification.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update notifications.'); }
    finally { setBusy(false); }
  };
  return <div className="notification-settings">
    <p>Get an alert for your turn, a trap or effect decision, and the game result. Tap the notification to open this table.</p>
    {reason ? <p role="status">{reason}</p> : denied ? <p role="status">Notifications are blocked. Allow them for Yokai 1504 in your browser or device notification settings, then reopen this panel.</p> : <div className="dialog-actions">
      {enabled ? <><button type="button" className="primary" disabled={busy} onClick={() => void action('test')}>Send test notification</button><button type="button" disabled={busy} onClick={() => void action('remove')}>Turn off for this game</button></> : <button type="button" className="primary" disabled={busy || !registration || !publicKey} onClick={() => void enable()}>{busy ? 'Enabling…' : registration ? 'Enable notifications' : 'Preparing notifications…'}</button>}
    </div>}
    {busy && !enabled && <p role="status">Choose Allow in your browser’s notification prompt. You can close this panel and return after allowing access.</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    <InstallHelp />
  </div>;
}
