/**
 * Web push subscription — the browser half.
 *
 * Notifications on the web have always been in-tab only: `new Notification()`
 * needs the page open, so closing the tab meant silence. This subscribes the
 * browser itself, through the service worker, so a notification arrives with
 * DeHub closed — which is what "notifications" means everywhere else.
 *
 * Everything here degrades rather than throws. A browser with no push support,
 * a deployment with no VAPID keys, a reader who said no to the permission
 * prompt: all end with in-tab notifications still working, because that is
 * strictly better than an error nobody can act on.
 *
 * @module lib/web-push
 */

import { getVapidPublicKey, registerPushToken, unregisterPushToken } from '@/lib/api/dehub';
import { getDeviceId } from '@/lib/device-id';

/**
 * What the browser is actually doing about push, as opposed to what our
 * stored flag says it ought to be doing.
 *
 * Those are not the same thing, and the gap between them is not theoretical:
 * a browser can hold the permission, run the service worker, and still refuse
 * to register a subscription. A corrupt push key store does exactly that, and
 * every subscribe() then fails with "could not retrieve the public key".
 * None of that is visible to the reader, so the switch sits on over a channel
 * that cannot deliver. This is what lets a surface say so instead.
 *
 *   'unknown'     - not resolved yet this page load
 *   'unsupported' - no service worker, or no PushManager
 *   'off'         - no permission, or deliberately unsubscribed
 *   'subscribed'  - a live subscription the server knows about
 *   'unavailable' - we asked, and the browser or the deployment said no
 *   'blocked'     - subscribed fine, but the OS refuses to display anything
 */
export type WebPushState =
  | 'unknown'
  | 'unsupported'
  | 'off'
  | 'subscribed'
  | 'unavailable'
  | 'blocked';

const STATE_EVENT = 'dehub:web-push-state-changed';

let state: WebPushState = 'unknown';

function setState(next: WebPushState): void {
  if (state === next) return;
  state = next;
  try {
    window.dispatchEvent(new Event(STATE_EVENT));
  } catch {}
}

export function getWebPushState(): WebPushState {
  return state;
}

export function subscribeWebPushState(onChange: () => void): () => void {
  window.addEventListener(STATE_EVENT, onChange);
  return () => window.removeEventListener(STATE_EVENT, onChange);
}

/** The VAPID key arrives base64url; `applicationServerKey` wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  // Annotated off the allocation, not as a bare Uint8Array: a bare annotation
  // widens the buffer type and CI rejects it where the local build does not.
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function toSubscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  };
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

let inFlight: Promise<boolean> | null = null;

/**
 * Subscribe this browser and tell the API about it.
 *
 * Returns false for every "cannot", quietly: no support, no keys configured,
 * no permission, no service worker yet. The caller's job is to keep in-tab
 * notifications working either way, not to explain the browser to the reader.
 */
export async function subscribeToWebPush(): Promise<boolean> {
  if (!isWebPushSupported()) {
    setState('unsupported');
    return false;
  }
  if (Notification.permission !== 'granted') {
    setState('off');
    return false;
  }

  // Two callers race on a normal load: setStoredEnabled, when a surface flips
  // the switch, and the once-per-load reconcile. Each one that gets through is
  // a POST to /api/push/token, so they share one attempt rather than making
  // two and registering the same endpoint twice.
  if (!inFlight) {
    inFlight = attemptSubscribe().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function attemptSubscribe(): Promise<boolean> {
  try {
    const publicKey = await getVapidPublicKey();
    if (!publicKey) {
      // No VAPID keys on this deployment: push is off for everyone, which is
      // a different thing from broken for this reader.
      setState('unavailable');
      return false;
    }

    // `ready` rather than `register`: the worker is registered at boot
    // (lib/register-sw), and waiting on ready avoids racing that.
    const registration = await navigator.serviceWorker.ready;

    // An existing subscription is reused unless it was made with a different
    // key — a rotated VAPID key leaves subscriptions that the push service
    // still accepts and the server can no longer sign for.
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const existingKey = existing.options?.applicationServerKey;
      const sameKey =
        existingKey &&
        new Uint8Array(existingKey).toString() === urlBase64ToUint8Array(publicKey).toString();
      if (sameKey) {
        await registerSubscription(existing);
        setState('subscribed');
        return true;
      }
      await existing.unsubscribe().catch(() => {});
    }

    const subscription = await registration.pushManager.subscribe({
      // Required by every browser that implements push: a subscription that
      // could fire silently is one a site could use to track you with.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await registerSubscription(subscription);
    setState('subscribed');
    return true;
  } catch (error) {
    console.warn('[web-push] subscribe failed', error);
    setState('unavailable');
    return false;
  }
}

async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const payload = toSubscriptionPayload(subscription);
  const result = await registerPushToken({
    // The endpoint IS the device identity on the web — unique per browser
    // install, and stable until the subscription is replaced.
    token: payload.endpoint,
    deviceId: getDeviceId(),
    platform: 'web',
    deviceName: browserName(),
    webSubscription: payload,
  });
  if (!result.success) {
    throw new Error(result.message || 'Push registration was rejected');
  }
}

/** Unsubscribe this browser and drop the row server-side. */
/**
 * Ask the service worker to display one, and report whether it could.
 *
 * This is the only honest capability check, and the old one was not it.
 * `new Notification()` from the page CONSTRUCTS successfully on a machine
 * whose OS is blocking the browser's notifications - observed directly, not
 * theorised - so the enable-time test passed while nothing was ever
 * displayed, and no surface could tell. `registration.showNotification()` is
 * the path a real push takes, and it rejects (with an empty reason, so there
 * is nothing to log) when the OS refuses. Anything gating on "can we
 * deliver" has to go through here.
 */
export async function probeNotificationDisplay(title: string, body: string): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      tag: 'dehub-test-notification',
      data: { url: '/app/notifications' },
    });
    return true;
  } catch {
    // The subscription may be perfectly healthy; the operating system is
    // simply refusing to post it. Different fault, different advice.
    setState('blocked');
    return false;
  }
}

/**
 * Tear the subscription down and build a fresh one.
 *
 * The reconcile deliberately reuses a subscription whose key still matches,
 * which is right for the ordinary case and useless for a dead one: the
 * browser still reports it, the server still holds the endpoint, and every
 * send is accepted and delivered nowhere. Switching the setting off and on
 * is what people discover by accident - this is that, as one call.
 */
export async function resubscribeWebPush(): Promise<boolean> {
  await unsubscribeFromWebPush();
  return subscribeToWebPush();
}

export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;
  setState('off');
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe().catch(() => {});
    // Dropped server-side too: an unsubscribed endpoint would answer 410 on
    // the next send and be cleaned up eventually, but "eventually" means the
    // reader keeps a row that says they want notifications they turned off.
    await unregisterPushToken(getDeviceId()).catch(() => {});
  } catch (error) {
    console.warn('[web-push] unsubscribe failed', error);
  }
}

/** Rough, and only used as a label in the account's device list. */
function browserName(): string {
  const ua = navigator.userAgent;
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Browser';
}
