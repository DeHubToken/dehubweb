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
const MAX_ENTRIES = 120;
/** Per-draft ceiling. Longer than any composer's own maxLength, so it never truncates real input. */
const MAX_CHARS = 20_000;

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
  } catch {
    store = {};
  }
  return store;
}

/** Newest-first trim, applied only when over the cap so the common path is free. */
function trim(current: DraftStore): DraftStore {
  const keys = Object.keys(current);
  if (keys.length <= MAX_ENTRIES) return current;
  const out: DraftStore = {};
  for (const key of keys.sort((a, b) => current[b].u - current[a].u).slice(0, MAX_ENTRIES)) {
    out[key] = current[key];
  }
  return out;
}

let writeQueued = false;

function serialize(entries: DraftStore): string {
  return JSON.stringify({ v: 1, w: Date.now(), d: entries });
}

function writeNow(): void {
  writeQueued = false;
  if (typeof window === 'undefined' || !store) return;
  try {
    store = trim(store);
    if (Object.keys(store).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, serialize(store));
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

/** True when a scope currently holds a draft. */
export function hasDraft(key: string): boolean {
  return !!key && !!load()[key];
}

/**
 * Save (or, for empty text, delete) the draft for a scope.
 * Whitespace-only counts as empty — a stray newline is not a draft worth keeping.
 */
export function writeDraft(key: string, text: string): void {
  if (!key) return;
  const current = load();
  if (!text.trim()) {
    if (!(key in current)) return;
    delete current[key];
  } else {
    if (current[key]?.t === text) return;
    current[key] = { t: text.slice(0, MAX_CHARS), u: stamp() };
  }
  scheduleWrite();
}

/** Drop a draft — call once the message has actually gone out. */
export function clearDraft(key: string): void {
  if (!key) return;
  const current = load();
  if (!(key in current)) return;
  delete current[key];
  scheduleWrite();
}

/** Test seam — drops the in-memory mirror so the next read re-parses storage. */
export function __resetDraftCacheForTests(): void {
  store = null;
  writeQueued = false;
  lastStamp = 0;
  listeners.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDrafts();
  });
  window.addEventListener('pagehide', flushDrafts);

  /**
   * Two tabs each hold a full copy of the store, so a blind write from one
   * would resurrect drafts the other just sent, and a blind read would delete
   * drafts the other is still typing. Merge on entry timestamp, and use the
   * blob's own write time to tell "they cleared it" from "they never saw it".
   */
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const { entries: incoming, writtenAt } = parse(event.newValue);
    const current = load();
    let changed = false;
    for (const [key, entry] of Object.entries(incoming)) {
      if (!current[key] || current[key].u < entry.u) {
        current[key] = entry;
        changed = true;
      }
    }
    for (const key of Object.keys(current)) {
      // Absent from their snapshot and older than it — they sent or cleared it.
      if (!(key in incoming) && current[key].u <= writtenAt) {
        delete current[key];
        changed = true;
      }
    }
    if (changed) emit();
  });
}
