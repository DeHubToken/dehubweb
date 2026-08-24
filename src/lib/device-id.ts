/**
 * Web device identity
 * ===================
 * A stable per-browser id, sent to the API as `X-Device-Id`.
 *
 * The server has always recorded a device id per session, but the web client
 * never sent one, so every browser session on the platform was stored under
 * the literal string `web`. That made two things impossible: telling a user's
 * three browsers apart in their own session list, and telling one abuser's ten
 * accounts apart from ten unrelated people.
 *
 * **This is not a fingerprint and is not meant to be.** It is a random value we
 * generate once and keep. Clearing site data resets it, and a private window
 * gets a fresh one — both by design. Nothing here reads hardware, canvas,
 * fonts, or anything else a user has not agreed to hand over, and nothing here
 * should ever start doing so: the cost of fingerprinting is an arms race we
 * lose plus a privacy exposure we do not want, and the benefit is small against
 * anyone motivated enough to be worth stopping.
 *
 * So treat it as what it is — enough to make casual multi-accounting
 * inconvenient and to make investigation possible after the fact. The control
 * that actually costs an abuser something is the on-chain history requirement
 * at signup.
 *
 * Stored in two places because they fail differently: localStorage survives a
 * cookie purge, the cookie survives localStorage being cleared or unavailable
 * (Safari private mode, storage partitioning, quota errors). Either one alone
 * regenerates the id far more often than necessary.
 */

const STORAGE_KEY = 'dehub:device-id';
const COOKIE_NAME = 'dehub_did';
const COOKIE_MAX_AGE_SECONDS = 2 * 365 * 24 * 60 * 60; // 2 years

/** Cached for the page's lifetime so we touch storage once, not per request. */
let cached: string | null = null;

function generateId(): string {
  // randomUUID needs a secure context; getRandomValues is available more widely.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Last resort. Only reached without any Web Crypto at all, where the id is
  // still fine for its purpose — it identifies a browser, it does not secure
  // anything.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(value: string): void {
  if (typeof document === 'undefined') return;
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookies disabled — localStorage alone still works.
  }
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Private mode, partitioned storage, quota — all non-fatal.
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // As above. The cookie is the fallback.
  }
}

/**
 * This browser's device id, creating and persisting one on first call.
 *
 * Always returns a value, including when every storage mechanism is
 * unavailable — in that case the id lasts only as long as the page, which is
 * the correct degradation: a per-page id is useless for tracking somebody, and
 * a thrown error here would break sign-in.
 */
export function getDeviceId(): string {
  if (cached) return cached;

  // Whichever store still has it wins, and we heal the other one.
  const existing = readStorage() || readCookie();
  const id = existing || generateId();

  if (readStorage() !== id) writeStorage(id);
  if (readCookie() !== id) writeCookie(id);

  cached = id;
  return id;
}

/**
 * Device headers for an API request.
 *
 * `X-Platform: web` is the load-bearing half. The server used to infer platform
 * from the device id — anything that was not the string `web` counted as
 * mobile — so a browser sending a real id would otherwise be handed a
 * mobile-length session. The backend records the platform it is told; this is
 * what tells it.
 */
export function deviceHeaders(): Record<string, string> {
  return {
    'X-Device-Id': getDeviceId(),
    'X-Platform': 'web',
  };
}
