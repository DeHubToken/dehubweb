/**
 * The Kids Mode device lock.
 *
 * Two things have to be true for Kids Mode to work, and they live in different
 * places. The account flag is the authority and the server reads it directly;
 * this is the local half — one key in localStorage, read synchronously by
 * `apiCall` so every request carries `X-Kids-Mode` from the first one, before
 * any React state has mounted or any query has resolved.
 *
 * It is deliberately a plain module and not a hook or a context. The header
 * has to be attachable from inside `apiCall`, which is called by code that has
 * no component tree above it — the boot fetch included — and a lock that only
 * applies once a provider has rendered is a lock with a gap at exactly the
 * moment a page is being restored.
 *
 * Every accessor is wrapped: a private window, cleared site data or a blocked
 * storage partition all throw rather than return null, and Kids Mode failing
 * to arm because storage threw would be the worst possible failure. On a read
 * error it reports locked when it last knew it was locked, because the
 * in-memory mirror below survives a storage that has stopped answering.
 *
 * @module lib/kids-mode-lock
 */

const STORAGE_KEY = 'dhb_kids_mode';

/**
 * Mirror of the stored value, so a read never depends on storage answering
 * twice and `apiCall` never pays for a storage hit per request.
 */
let cached: boolean | null = null;

/** Listeners for same-tab changes — `storage` events only fire in OTHER tabs. */
const listeners = new Set<(locked: boolean) => void>();

function readStorage(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage is unavailable. Fall back to whatever we last knew, which is
    // `false` on a cold start — the account flag still locks a signed-in
    // session server-side, so this degrades to "the header is missing",
    // never to "Kids Mode is off".
    return cached === true;
  }
}

/** Whether this device is locked into Kids Mode. Safe to call anywhere, synchronously. */
export function isKidsModeLocked(): boolean {
  if (cached === null) cached = readStorage();
  return cached;
}

/**
 * Arm or clear the local lock.
 *
 * Only ever called after the server has agreed — enabling writes this once
 * `POST /kids-mode/enable` succeeds, and clearing it waits for a successful
 * `disable`/`reset`. Writing it optimistically would let a failed PIN check
 * leave the device in a state the account disagrees with.
 */
export function setKidsModeLocked(locked: boolean): void {
  cached = locked;
  try {
    if (locked) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory mirror above still holds for this tab, and the account
    // flag holds everywhere else.
  }
  listeners.forEach(fn => {
    try {
      fn(locked);
    } catch {
      /* a listener must never break the lock */
    }
  });
}

/** Subscribe to lock changes, in this tab and in others. Returns an unsubscribe. */
export function onKidsModeChange(fn: (locked: boolean) => void): () => void {
  listeners.add(fn);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = event.newValue === '1';
    fn(cached);
  };
  try {
    window.addEventListener('storage', onStorage);
  } catch {
    /* no window — nothing to listen to */
  }

  return () => {
    listeners.delete(fn);
    try {
      window.removeEventListener('storage', onStorage);
    } catch {
      /* already gone */
    }
  };
}
