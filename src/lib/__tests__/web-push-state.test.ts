/**
 * Web push subscription state.
 *
 * The bug these exist for: permission granted, service worker running, and the
 * browser still refuses to register a subscription — a corrupt push key store
 * does exactly that, and every attempt fails with "could not retrieve the
 * public key". Nothing surfaced it, so Settings showed the switch on over a
 * channel that could not deliver anything with the tab closed.
 *
 * The module holds its state at module scope and schedules no timers, so
 * vi.resetModules() alone gives each test a clean state machine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/** 87 base64url characters decode to the 65 bytes an application server key is. */
const VAPID = 'B' + 'A'.repeat(86);

const getVapidPublicKey = vi.fn();
const registerPushToken = vi.fn();
const unregisterPushToken = vi.fn();

vi.mock('@/lib/api/dehub', () => ({
  getVapidPublicKey: () => getVapidPublicKey(),
  registerPushToken: (params: unknown) => registerPushToken(params),
  unregisterPushToken: (deviceId: string) => unregisterPushToken(deviceId),
}));

vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'device-1' }));

function fakeSubscription(endpoint = 'https://push.example/abc') {
  return {
    endpoint,
    options: {},
    toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

/** A browser that supports push, holds the permission, and does `subscribe`. */
function installBrowser(opts: {
  subscribe: () => unknown;
  existing?: unknown;
  /** Left undefined, the OS accepts the notification. */
  showNotification?: () => unknown;
}) {
  const pushManager = {
    getSubscription: vi.fn(async () => opts.existing ?? null),
    subscribe: vi.fn(async () => opts.subscribe()),
  };
  const showNotification = vi.fn(async () =>
    opts.showNotification ? opts.showNotification() : undefined,
  );
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: Promise.resolve({ pushManager, showNotification }) },
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
  });
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('Notification', { permission: 'granted' });
  return { pushManager, showNotification };
}

async function freshModule() {
  vi.resetModules();
  return import('../web-push');
}

describe('web push state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    getVapidPublicKey.mockResolvedValue(VAPID);
    registerPushToken.mockResolvedValue({ success: true, message: 'registered' });
  });

  it('reports unavailable when the browser refuses to register', async () => {
    installBrowser({
      subscribe: () => {
        const error = new Error('Registration failed - could not retrieve the public key');
        error.name = 'AbortError';
        throw error;
      },
    });

    const mod = await freshModule();
    expect(mod.getWebPushState()).toBe('unknown');

    await expect(mod.subscribeToWebPush()).resolves.toBe(false);

    expect(mod.getWebPushState()).toBe('unavailable');
    // Nothing reached the server, so there is no row implying we can be reached.
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('reports subscribed and registers the endpoint when it works', async () => {
    const sub = fakeSubscription();
    installBrowser({ subscribe: () => sub });

    const mod = await freshModule();
    await expect(mod.subscribeToWebPush()).resolves.toBe(true);

    expect(mod.getWebPushState()).toBe('subscribed');
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(registerPushToken.mock.calls[0][0]).toMatchObject({
      platform: 'web',
      token: sub.endpoint,
      deviceId: 'device-1',
    });
  });

  it('registers once when two callers race on the same load', async () => {
    installBrowser({ subscribe: () => fakeSubscription() });

    const mod = await freshModule();
    const [first, second] = await Promise.all([mod.subscribeToWebPush(), mod.subscribeToWebPush()]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });

  it('does not claim subscription when the backend rejects registration', async () => {
    registerPushToken.mockResolvedValue({ success: false, message: 'conflicting token' });
    installBrowser({ subscribe: () => fakeSubscription() });

    const mod = await freshModule();
    await expect(mod.subscribeToWebPush()).resolves.toBe(false);

    expect(mod.getWebPushState()).toBe('unavailable');
  });

  it('treats a deployment with no VAPID key as unavailable, and asks for nothing', async () => {
    getVapidPublicKey.mockResolvedValue('');
    const { pushManager } = installBrowser({ subscribe: () => fakeSubscription() });

    const mod = await freshModule();
    await expect(mod.subscribeToWebPush()).resolves.toBe(false);

    expect(mod.getWebPushState()).toBe('unavailable');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('tells listeners, which is the only reason a mounted switch ever updates', async () => {
    installBrowser({
      subscribe: () => {
        throw new Error('nope');
      },
    });

    const mod = await freshModule();
    const onChange = vi.fn();
    const stop = mod.subscribeWebPushState(onChange);

    await mod.subscribeToWebPush();

    expect(onChange).toHaveBeenCalled();
    stop();
  });

  it('reports off once the reader turns it back off', async () => {
    const sub = fakeSubscription();
    installBrowser({ subscribe: () => sub });

    const mod = await freshModule();
    await mod.subscribeToWebPush();
    expect(mod.getWebPushState()).toBe('subscribed');

    await mod.unsubscribeFromWebPush();
    expect(mod.getWebPushState()).toBe('off');
  });

  it('reports blocked when the OS refuses to display a notification', async () => {
    // The bug this exists for: the old check used `new Notification()` from
    // the page, which constructs happily on a machine whose OS is blocking
    // the browser. Only the service worker's own call rejects, so only it
    // can tell the difference between "delivering" and "silently dropped".
    installBrowser({
      subscribe: () => fakeSubscription(),
      showNotification: () => {
        throw undefined;
      },
    });

    const mod = await freshModule();
    await expect(mod.probeNotificationDisplay('DeHub', 'probe')).resolves.toBe(false);
    expect(mod.getWebPushState()).toBe('blocked');
  });

  it('leaves the state alone when the OS does display it', async () => {
    installBrowser({ subscribe: () => fakeSubscription() });

    const mod = await freshModule();
    await mod.subscribeToWebPush();
    await expect(mod.probeNotificationDisplay('DeHub', 'probe')).resolves.toBe(true);
    expect(mod.getWebPushState()).toBe('subscribed');
  });

  it('reports off, not unavailable, when the permission is not granted', async () => {
    installBrowser({ subscribe: () => fakeSubscription() });
    vi.stubGlobal('Notification', { permission: 'default' });

    const mod = await freshModule();
    await expect(mod.subscribeToWebPush()).resolves.toBe(false);

    // 'unavailable' would put a warning in front of someone who simply has not
    // been asked yet.
    expect(mod.getWebPushState()).toBe('off');
  });
});
