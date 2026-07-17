/**
 * Comment Count Cache
 * ===================
 * Stores optimistic comment count deltas in localStorage so the UI
 * can show updated counts immediately after posting, before the API
 * catches up.
 */

const STORAGE_KEY = 'comment_count_deltas';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

interface DeltaEntry {
  delta: number;
  updatedAt: number;
}

function getStore(): Record<string, DeltaEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DeltaEntry>;
    // Prune stale entries
    const now = Date.now();
    const cleaned: Record<string, DeltaEntry> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (now - entry.updatedAt < MAX_AGE_MS) {
        cleaned[key] = entry;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, DeltaEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* storage full – ignore */ }
}

/** Increment the optimistic comment count for a token */
export function incrementCommentCount(tokenId: string) {
  const store = getStore();
  const existing = store[tokenId];
  store[tokenId] = {
    delta: (existing?.delta ?? 0) + 1,
    updatedAt: Date.now(),
  };
  saveStore(store);
}

/** Get the delta (number of locally-added comments not yet reflected in API) */
export function getCommentCountDelta(tokenId: string): number {
  const store = getStore();
  return store[tokenId]?.delta ?? 0;
}

/** Clear the delta for a token (e.g. when fresh API data arrives that includes the new comments) */
export function clearCommentCountDelta(tokenId: string) {
  const store = getStore();
  delete store[tokenId];
  saveStore(store);
}
