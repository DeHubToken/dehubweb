/**
 * Repost Cache
 * ============
 * localStorage-backed store for repost state so the bold icon
 * persists across page refreshes and navigations.
 */

const STORAGE_KEY = 'dehub-repost-cache';
const MAX_ENTRIES = 500;

function getStore(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, number>): void {
  try {
    // Prune oldest entries if over limit
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => store[a] - store[b]);
      const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
      for (const k of toRemove) delete store[k];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable
  }
}

export function markReposted(postId: string): void {
  const store = getStore();
  store[postId] = Date.now();
  saveStore(store);
}

export function isPostReposted(postId: string): boolean {
  const store = getStore();
  return postId in store;
}

export function unmarkReposted(postId: string): void {
  const store = getStore();
  delete store[postId];
  saveStore(store);
}
