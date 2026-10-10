/**
 * Draft Cache
 * ===========
 * One durable store for every half-typed message on DeHub — DMs, public chat,
 * stage/TV chat, live-stream chat. Text survives closing the thread, navigating
 * away, a reload, and the tab being closed.
 *
 * Why this is a shared module rather than per-composer state:
 *
 *   - The DM composer is remounted for reasons the user never sees. A brand new
 *     conversation is born with a *virtual* id ("new_0x…") and swaps to a real
 *     Mongo ObjectId the moment the server catches up, and anything keyed on
 *     that id is thrown away mid-sentence. Drafts are therefore keyed on the
 *     PEER (address / group / room id), which never changes.
 *   - "The session never started" is the normal case for a first message: there
 *     is no conversation on the server to attach a draft to, so it has to live
 *     entirely on the client.
 *
 * Shape on disk — one key, not one key per draft. A key per thread leaks
 * unbounded entries into a 5 MB quota shared with auth and wallet state:
 *
 *   dehub-drafts-v1 -> { v: 1, w: <write ms>, d: { "<scope>": { t: "…", u: <ms> } } }
 *
 * Writes are debounced onto idle and flushed on tab-hide, so typing never pays
 * a JSON.stringify. Reads come from an in-memory mirror, so they are free.
 *
 * @module lib/draft-cache
 */

const STORAGE_KEY = 'dehub-drafts-v1';

/** Older than this and the draft is forgotten — a month-old half-sentence is noise. */
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
/** Newest-first cap. Well above how many threads anyone has open in a month. */
const MAX_ENTRIES = 300;
/** Combined character budget. Entries are evicted whole, never truncated. */
const MAX_CHARS = 1_000_000;

interface DraftEntry {
  /** The text itself. */
  t: string;
  /** Last-updated ms epoch — drives both expiry and cross-tab merge. */
  u: number;
}

type DraftStore = Record<string, DraftEntry>;

/**
 * In-memory mirror. Mutated synchronously so a read right after a write is
 * correct even though the localStorage write is still queued.
 */
let store: DraftStore | null = null;
// Only these keys may replace the latest disk snapshot. Other tabs can update
// unrelated fields between our last storage event and the next keystroke.
const dirty = new Set<string>();

/**
 * Monotonic stamp. Several drafts can be written inside one millisecond, and
 * with a plain Date.now() the newest-first trim would then be deciding ties by
 * insertion order — i.e. keeping the OLDEST entries and evicting what was just
 * typed. Never goes backwards, so it also settles cross-tab merges.
 */
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* a bad subscriber must not break typing */ }
  }
}

/** Subscribe to draft changes — used by the conversation list to show its "Draft" line. */
export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function parse(raw: string | null): { entries: DraftStore; writtenAt: number } {
  if (!raw) return { entries: {}, writtenAt: 0 };
  try {
    const parsed = JSON.parse(raw) as { v?: number; w?: number; d?: unknown };
    if (!parsed || parsed.v !== 1 || typeof parsed.d !== 'object' || parsed.d === null) {
      return { entries: {}, writtenAt: 0 };
    }
    const cutoff = Date.now() - MAX_AGE;
    const entries: DraftStore = {};
    for (const [key, value] of Object.entries(parsed.d as Record<string, unknown>)) {
      const entry = value as Partial<DraftEntry>;
      if (typeof entry?.t !== 'string' || typeof entry?.u !== 'number') continue;
      if (entry.u < cutoff) continue;
      entries[key] = { t: entry.t, u: entry.u };
    }
    return { entries, writtenAt: typeof parsed.w === 'number' ? parsed.w : 0 };
  } catch {
    return { entries: {}, writtenAt: 0 };
  }
}

function load(): DraftStore {
  if (store) return store;
  if (typeof window === 'undefined') {
    store = {};
    return store;
  }
  try {
    store = parse(localStorage.getItem(STORAGE_KEY)).entries;
    for (const entry of Object.values(store)) lastStamp = Math.max(lastStamp, entry.u);
  } catch {
    store = {};
  }
  return store;
}

/** Newest-first trim, applied only when over the cap so the common path is free. */
function trim(current: DraftStore): DraftStore {
  const out: DraftStore = {};
  let chars = 0;
  for (const key of Object.keys(current).sort((a, b) => current[b].u - current[a].u)) {
    if (Object.keys(out).length >= MAX_ENTRIES) break;
    // Keep the newest draft whole even if it alone exceeds the normal budget.
    if (chars && chars + current[key].t.length > MAX_CHARS) continue;
    out[key] = current[key];
    chars += current[key].t.length;
  }
  return out;
}

let writeQueued = false;

function serialize(entries: DraftStore): string {
  return JSON.stringify({ v: 1, w: Date.now(), d: entries });
}

function writeNow(): void {
  writeQueued = false;
  if (typeof window === 'undefined' || !store || !dirty.size) return;
  try {
    const latest = parse(localStorage.getItem(STORAGE_KEY)).entries;
    for (const key of dirty) {
      if (store[key]) latest[key] = store[key];
      else delete latest[key];
    }
    store = trim(latest);
    if (Object.keys(store).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      dirty.clear();
      return;
    }
    localStorage.setItem(STORAGE_KEY, serialize(store));
    dirty.clear();
  } catch {
    // Quota exceeded — drop the oldest half and try once. Losing an old draft
    // beats losing the one being typed right now.
    try {
      const snapshot = store;
      const keys = Object.keys(snapshot).sort((a, b) => snapshot[b].u - snapshot[a].u);
      const kept: DraftStore = {};
      for (const key of keys.slice(0, Math.ceil(keys.length / 2))) kept[key] = snapshot[key];
      store = kept;
      localStorage.setItem(STORAGE_KEY, serialize(kept));
      dirty.clear();
    } catch {
      // Storage unusable (private mode, disabled). The in-memory mirror still
      // carries the draft for this page's lifetime — never throw at a keystroke.
    }
  }
}

const scheduleIdle: (cb: () => void) => void =
  typeof window !== 'undefined' &&
  typeof (window as { requestIdleCallback?: unknown }).requestIdleCallback === 'function'
    ? (cb) =>
        (window as unknown as {
          requestIdleCallback: (c: () => void, o?: { timeout: number }) => void;
        }).requestIdleCallback(cb, { timeout: 1000 })
    : (cb) => { setTimeout(cb, 300); };

function scheduleWrite(): void {
  emit();
  if (writeQueued) return;
  writeQueued = true;
  scheduleIdle(writeNow);
}

/** Force any queued write out immediately. Called on tab-hide and on unmount. */
export function flushDrafts(): void {
  if (writeQueued) writeNow();
}

/** Read the saved draft for a scope. Returns '' when there is none. */
export function readDraft(key: string): string {
  if (!key) return '';
  return load()[key]?.t ?? '';
}

/** Refresh a field before completing an async request, even if its storage event is delayed. */
export function readCurrentDraft(key: string): string {
  const current = load();
  if (!dirty.has(key) && typeof window !== 'undefined') {
    try {
      const latest = parse(localStorage.getItem(STORAGE_KEY)).entries[key];
      if (latest) current[key] = latest;
      else delete current[key];
    } catch { /* Use the in-memory draft if storage is unavailable. */ }
  }
  return current[key]?.t ?? '';
}

/** True when a scope currently holds a draft. */
export function hasDraft(key: string): boolean {
  return !!key && !!load()[key];
}

/**
 * Save (or, for empty text, delete) the draft for a scope.
 * Only an empty string clears; whitespace and line endings are preserved exactly.
 */
export function writeDraft(key: string, text: string): void {
  if (!key) return;
  const current = load();
  if (!text.length) {
    if (!(key in current)) return;
    delete current[key];
  } else {
    if (current[key]?.t === text) return;
    current[key] = { t: text, u: stamp() };
  }
  dirty.add(key);
  scheduleWrite();
}

/** Drop a draft — call once the message has actually gone out. */
export function clearDraft(key: string): void {
  if (!key) return;
  const current = load();
  if (!(key in current)) return;
  delete current[key];
  dirty.add(key);
  scheduleWrite();
}

/** Test seam — drops the in-memory mirror so the next read re-parses storage. */
export function __resetDraftCacheForTests(): void {
  store = null;
  writeQueued = false;
  lastStamp = 0;
  listeners.clear();
  dirty.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDrafts();
  });
  window.addEventListener('pagehide', flushDrafts);

  /** Refresh from disk, retaining only our own still-unflushed changes. */
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      // An earlier event can arrive after our own newer write.
      const incoming = parse(localStorage.getItem(STORAGE_KEY)).entries;
      const current = load();
      for (const key of dirty) {
        if (current[key]) incoming[key] = current[key];
        else delete incoming[key];
      }
      store = incoming;
      for (const entry of Object.values(incoming)) lastStamp = Math.max(lastStamp, entry.u);
      if (JSON.stringify(current) !== JSON.stringify(incoming)) emit();
    } catch { /* Keep the current page's drafts if storage becomes unavailable. */ }
  });
}
