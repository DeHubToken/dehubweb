/**
 * Comment Draft Cache
 * ===================
 * One unsent comment per post, held in localStorage so nothing typed is ever
 * lost: closing the sheet, an accidental dismiss, navigating away, a post that
 * the server refuses, or Safari discarding a backgrounded tab all leave the
 * text where the composer finds it again on the next open.
 *
 * **Keyed on the post and nothing else.** It used to key on
 * `tokenId:parentId` too — one entry per reply target — which meant the text
 * typed into a reply was filed under a key the composer never read again:
 * reopening the sheet showed an empty box with the draft still sitting on
 * disk. The composer holds exactly one message at a time, so the store holds
 * exactly one per post and the reply target travels with it.
 *
 * Text, the reply target and a GIF are all that survive. A `File` (image) and
 * a recorded voice note are object URLs belonging to one page load and cannot
 * be serialised; the composer restores those from memory when a post fails,
 * which is the only moment they can be recovered at all.
 */

const STORAGE_KEY = 'dehub-comment-drafts-v2';
/** The `{ [tokenId | tokenId:parentId]: text }` store this replaced. */
const LEGACY_STORAGE_KEY = 'dehub-comment-drafts';
/** Forget a draft nobody came back to. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Ceiling on entries; the oldest go first. Drafts are small, but the store
 *  is written on every keystroke and must not grow without bound. */
const MAX_DRAFTS = 100;

export interface CommentDraft {
  text: string;
  /** Comment being replied to, so the sheet reopens still pointed at it. */
  parentId?: string;
  parentUsername?: string;
  /** GIPHY URL — already hosted, so unlike a File it survives a reload. */
  gifUrl?: string;
  updatedAt: number;
}

type DraftStore = Record<string, CommentDraft>;

/**
 * In-memory mirror. Reads happen while the composer mounts, writes on every
 * keystroke; going through JSON.parse of the whole store each time is pure
 * cost. localStorage stays the source of truth across page loads, this is
 * just the copy this page load reads.
 */
let mirror: DraftStore | null = null;

function isDraft(value: unknown): value is CommentDraft {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CommentDraft).text === 'string'
  );
}

/**
 * Fold the old flat store in, once. Each legacy key is either `tokenId` (a
 * top-level draft) or `tokenId:parentId` (a reply). A post can have both, and
 * the top-level one wins — it is the box the composer opens showing.
 */
function migrateLegacy(): DraftStore {
  const migrated: DraftStore = {};
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return migrated;
    const legacy = JSON.parse(raw) as Record<string, string>;
    const now = Date.now();
    Object.entries(legacy).forEach(([key, text]) => {
      if (typeof text !== 'string' || !text.trim()) return;
      const [tokenId, parentId] = key.split(':');
      if (!tokenId) return;
      const existing = migrated[tokenId];
      if (existing && !existing.parentId) return;
      migrated[tokenId] = { text, parentId: parentId || undefined, updatedAt: now };
    });
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* unreadable legacy store — nothing to carry over */
  }
  return migrated;
}

function getStore(): DraftStore {
  if (mirror) return mirror;
  let store: DraftStore = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
          if (isDraft(value)) store[key] = value;
        });
      }
    } else {
      store = migrateLegacy();
    }
  } catch {
    /* private mode, quota, corrupt JSON — an empty store is a valid answer */
  }
  const cutoff = Date.now() - MAX_AGE_MS;
  Object.entries(store).forEach(([key, draft]) => {
    if ((draft.updatedAt ?? 0) < cutoff) delete store[key];
  });
  mirror = store;
  return store;
}

function persist(store: DraftStore): void {
  const keys = Object.keys(store);
  if (keys.length > MAX_DRAFTS) {
    keys
      .sort((a, b) => (store[a].updatedAt ?? 0) - (store[b].updatedAt ?? 0))
      .slice(0, keys.length - MAX_DRAFTS)
      .forEach(key => delete store[key]);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked — the mirror still carries this page load */
  }
}

/** Is there anything in here worth keeping? */
export function draftHasContent(draft: Pick<CommentDraft, 'text' | 'gifUrl'>): boolean {
  return Boolean(draft.text.trim() || draft.gifUrl);
}

/**
 * Write the composer's current contents. An empty composer clears the entry
 * rather than storing a blank, so a cleared box does not come back full.
 */
export function saveDraft(tokenId: string, draft: Omit<CommentDraft, 'updatedAt'>): void {
  if (!tokenId) return;
  const store = getStore();
  if (draftHasContent(draft)) {
    store[tokenId] = { ...draft, updatedAt: Date.now() };
  } else if (!store[tokenId]) {
    return; // nothing stored, nothing to clear — skip the write entirely
  } else {
    delete store[tokenId];
  }
  persist(store);
}

/** The unsent comment for this post, if there is one. */
export function loadDraft(tokenId: string): CommentDraft | null {
  if (!tokenId) return null;
  return getStore()[tokenId] ?? null;
}

/** Drop the draft — the comment posted, so it is no longer unsent. */
export function clearDraft(tokenId: string): void {
  if (!tokenId) return;
  const store = getStore();
  if (!store[tokenId]) return;
  delete store[tokenId];
  persist(store);
}

/** Tests only: forget the in-memory mirror so a fresh read hits storage. */
export function __resetDraftCacheForTests(): void {
  mirror = null;
}
