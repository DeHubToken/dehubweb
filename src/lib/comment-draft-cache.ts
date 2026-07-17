/**
 * Comment Draft Cache
 * ===================
 * Persists in-progress comment/reply text to localStorage so users
 * don't lose their drafts when navigating away.
 *
 * Key format: `{tokenId}` for top-level, `{tokenId}:{parentCommentId}` for replies.
 */

const STORAGE_KEY = 'dehub-comment-drafts';

interface DraftStore {
  [key: string]: string;
}

function getStore(): DraftStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: DraftStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* storage full */ }
}

function buildKey(tokenId: string, parentId?: string | null): string {
  return parentId ? `${tokenId}:${parentId}` : tokenId;
}

/** Save a draft comment/reply */
export function saveDraft(tokenId: string, text: string, parentId?: string | null): void {
  const store = getStore();
  const key = buildKey(tokenId, parentId);
  if (text.trim()) {
    store[key] = text;
  } else {
    delete store[key];
  }
  saveStore(store);
}

/** Load a draft comment/reply */
export function loadDraft(tokenId: string, parentId?: string | null): string {
  const store = getStore();
  return store[buildKey(tokenId, parentId)] ?? '';
}

/** Clear a draft after successful post */
export function clearDraft(tokenId: string, parentId?: string | null): void {
  const store = getStore();
  delete store[buildKey(tokenId, parentId)];
  saveStore(store);
}
