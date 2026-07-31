/**
 * Anonymous viewer id
 * ===================
 * A stable per-browser id sent with anonymous view records so the anon-views
 * edge function can tell two visitors behind the same IP apart. It is combined
 * server-side with the request IP and a secret salt before storage, so this
 * value never identifies anyone on its own — and it is deliberately not used
 * for anything except view dedup.
 *
 * Clearing storage produces a new id, which is fine: the IP half of the hash
 * still bounds how much a cleared id can inflate a count.
 */

const DEVICE_ID_KEY = 'dehub_anon_view_id';

let cached: string | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older Safari / non-secure contexts have no randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The current browser's anonymous viewer id, creating and persisting one on
 * first call. Returns a per-session id if localStorage is unavailable (private
 * mode, storage disabled) so view tracking still works.
 */
export function getAnonViewerId(): string {
  if (cached) return cached;

  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      cached = existing;
      return cached;
    }

    const created = generateId();
    localStorage.setItem(DEVICE_ID_KEY, created);
    cached = created;
    return cached;
  } catch {
    cached = generateId();
    return cached;
  }
}
