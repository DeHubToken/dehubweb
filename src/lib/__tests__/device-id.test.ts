/**
 * The device id has to be stable across reloads or it is worthless, and it has
 * to survive one storage mechanism being wiped or it regenerates constantly.
 * It also must never throw — it sits on the sign-in path, so an exception here
 * would lock people out of the site over a browser storage quirk.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return import('../device-id');
}

/** Minimal localStorage that can be told to fail, as Safari private mode does. */
function installStorage(opts: { throws?: boolean } = {}) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (opts.throws) throw new Error('storage unavailable');
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.throws) throw new Error('storage unavailable');
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

function installCookieJar() {
  let jar = '';
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        return jar;
      },
      set cookie(v: string) {
        const [pair] = v.split(';');
        const [name, value] = pair.split('=');
        const others = jar.split('; ').filter((c) => c && !c.startsWith(`${name}=`));
        jar = [...others, `${name}=${value}`].join('; ');
      },
    },
  });
  return {
    clear: () => {
      jar = '';
    },
    raw: () => jar,
  };
}

describe('getDeviceId', () => {
  let cookies: ReturnType<typeof installCookieJar>;

  beforeEach(() => {
    cookies = installCookieJar();
    installStorage();
    vi.stubGlobal('location', { protocol: 'https:' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the same id on repeated calls', async () => {
    const { getDeviceId } = await freshModule();
    expect(getDeviceId()).toBe(getDeviceId());
  });

  it('persists across a reload', async () => {
    const first = (await freshModule()).getDeviceId();
    const second = (await freshModule()).getDeviceId();
    expect(second).toBe(first);
  });

  it('recovers from the cookie when localStorage is cleared', async () => {
    const first = (await freshModule()).getDeviceId();

    installStorage(); // wiped, cookie jar intact

    expect((await freshModule()).getDeviceId()).toBe(first);
  });

  it('recovers from localStorage when cookies are cleared', async () => {
    const store = installStorage();
    const first = (await freshModule()).getDeviceId();
    expect(store.size).toBeGreaterThan(0);

    cookies.clear();

    expect((await freshModule()).getDeviceId()).toBe(first);
  });

  it('still returns an id when storage throws, without propagating', async () => {
    installStorage({ throws: true });
    cookies.clear();

    const { getDeviceId } = await freshModule();
    expect(() => getDeviceId()).not.toThrow();
    expect(getDeviceId()).toBeTruthy();
  });

  it('generates a value the server will treat as real, not a placeholder', async () => {
    // The backend drops anything under 8 chars or matching a known placeholder.
    const id = (await freshModule()).getDeviceId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(['web', 'web-unknown', 'ios-unknown', 'android-unknown', 'unknown']).not.toContain(id);
  });

  it('gives different browsers different ids', async () => {
    const first = (await freshModule()).getDeviceId();

    installStorage();
    cookies.clear();

    expect((await freshModule()).getDeviceId()).not.toBe(first);
  });
});

describe('deviceHeaders', () => {
  beforeEach(() => {
    installCookieJar();
    installStorage();
    vi.stubGlobal('location', { protocol: 'https:' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declares the platform, which is what keeps web on a 7-day session', async () => {
    const { deviceHeaders } = await freshModule();
    expect(deviceHeaders()['X-Platform']).toBe('web');
  });

  it('sends the same id the getter returns', async () => {
    const mod = await freshModule();
    expect(mod.deviceHeaders()['X-Device-Id']).toBe(mod.getDeviceId());
  });
});
