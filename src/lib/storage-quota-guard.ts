/**
 * Keeps localStorage writable.
 *
 * localStorage is capped at ~5MB per origin. Once it is full, every setItem in
 * the app throws QuotaExceededError — which silently breaks unrelated flows
 * (DM fee confirm, wallet session, drafts, settings) wherever a write is not
 * wrapped in try/catch.
 *
 * This module:
 *  1. Drops caches that are safe to rebuild (old locale packs, translation and
 *     media-shape caches) when a write hits the quota, then retries the write.
 *  2. Never lets a quota error escape setItem: a write that still does not fit
 *     is skipped with a warning instead of crashing the caller.
 *
 * Only regenerable caches are evicted. Auth, wallet, drafts and preferences
 * are never touched.
 */

/** Keys that are pure caches and can be refetched or recomputed. */
const EVICTABLE_PREFIXES = [
  'locale-pack:',
  'dehub-translation-cache-',
  'dehub-profile-cache:',
  'media-aspects-',
  'video-aspects-',
  'home-shorts-recent:',
  'dehub_stories_cache',
  'dehub_rq_cache_',
  'cloud_usage_log',
];

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

function listKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/**
 * Removes locale packs that belong to another build. Each deploy ships a new
 * manifest version, so packs for older versions are never read again.
 */
export function pruneStaleLocalePacks(currentVersion: string, storage: Storage = localStorage): number {
  let removed = 0;
  try {
    for (const key of listKeys(storage)) {
      if (key.startsWith('locale-pack:') && !key.startsWith(`locale-pack:${currentVersion}:`)) {
        storage.removeItem(key);
        removed++;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return removed;
}

/** Removes every regenerable cache entry except `keep`. Returns how many were removed. */
export function evictCaches(storage: Storage = localStorage, keep?: string): number {
  let removed = 0;
  try {
    for (const key of listKeys(storage)) {
      if (key === keep) continue;
      if (EVICTABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
        removed++;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return removed;
}

let installed = false;

export function installStorageQuotaGuard(): void {
  if (installed || typeof Storage === 'undefined') return;
  installed = true;
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function guardedSetItem(this: Storage, key: string, value: string) {
    try {
      return originalSetItem.call(this, key, value);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      if (evictCaches(this, key) > 0) {
        try {
          return originalSetItem.call(this, key, value);
        } catch (retryError) {
          if (!isQuotaError(retryError)) throw retryError;
        }
      }
      console.warn(`[storage] Skipped saving "${key}": browser storage is full.`);
    }
  };
}

installStorageQuotaGuard();
