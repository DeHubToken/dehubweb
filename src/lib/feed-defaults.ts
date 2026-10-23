/**
 * Feed defaults: the feed tab the home page opens on, and the filter toggles a
 * viewer has set, kept as their defaults until they reset them.
 *
 * Both live on the account in `customs` (`defaultFeedTab`, `feedToggles`) so
 * they follow the viewer to every device, and the app reads the same keys
 * (dehub-mobile libs/feed-defaults.ts). A localStorage copy gives the first
 * paint its values before the profile arrives, and is all a signed-out viewer
 * has.
 *
 * `feedToggles` is a JSON string, because customs values are flat strings of at
 * most 500 characters (dehub-stream-backend common/util/profile-customs.ts).
 * Only toggles that differ from a feed's own default are kept, encoded small:
 * an option object is stored by its `value`, the content chips as the list of
 * those switched on.
 *
 * @module lib/feed-defaults
 */

export const DEFAULT_FEED_TAB_KEY = 'defaultFeedTab';
export const FEED_TOGGLES_KEY = 'feedToggles';

const TAB_LS_KEY = 'dehub:defaultFeedTab';
const TOGGLES_LS_KEY = 'dehub:feedToggles';
const HOME_STATE_STORAGE_KEY = 'home-feed-state';
const SESSION_SEEDED_KEY = 'feed-tab-seeded';
const MAX_CUSTOMS_VALUE = 500;

/** Fired on window whenever a default changes locally, so the sync can push it. */
export const FEED_DEFAULTS_CHANGED_EVENT = 'feed-defaults-changed';
/** Fired when every feed should re-read its toggles (reset, or the account's arrived). */
export const FEED_TOGGLES_RELOAD_EVENT = 'feed-toggles-reload';

export const FEED_TAB_VALUES = ['home', 'shorts', 'images', 'videos', 'music', 'live'] as const;
export type FeedTabValue = (typeof FEED_TAB_VALUES)[number];

/** feed -> filter key -> encoded value */
export type FeedToggles = Record<string, Record<string, unknown>>;

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage full or blocked */ }
}

export function parseDefaultFeedTab(raw: unknown): FeedTabValue {
  return (FEED_TAB_VALUES as readonly string[]).includes(raw as string) ? (raw as FeedTabValue) : 'home';
}

export function parseFeedToggles(raw: unknown): FeedToggles {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: FeedToggles = {};
    for (const [feed, keys] of Object.entries(parsed)) {
      if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[feed] = { ...(keys as Record<string, unknown>) };
    }
    return out;
  } catch {
    return {};
  }
}

/** Compact JSON that fits a customs value; long category lists go first. */
export function serializeFeedToggles(toggles: FeedToggles): string {
  const copy: FeedToggles = {};
  for (const [feed, keys] of Object.entries(toggles)) {
    if (keys && Object.keys(keys).length) copy[feed] = { ...keys };
  }
  let json = JSON.stringify(copy);
  if (json.length <= MAX_CUSTOMS_VALUE) return json;
  for (const keys of Object.values(copy)) {
    for (const k of ['categories', 'cat']) if (k in keys) delete keys[k];
  }
  json = JSON.stringify(copy);
  return json.length <= MAX_CUSTOMS_VALUE ? json : '{}';
}

export function readDefaultFeedTab(): FeedTabValue {
  return parseDefaultFeedTab(readLS(TAB_LS_KEY));
}

export function readFeedToggles(): FeedToggles {
  return parseFeedToggles(readLS(TOGGLES_LS_KEY));
}

function announce() {
  window.dispatchEvent(new CustomEvent(FEED_DEFAULTS_CHANGED_EVENT));
}

export function setDefaultFeedTab(tab: FeedTabValue) {
  writeLS(TAB_LS_KEY, tab);
  announce();
}

/** One feed's toggle; `undefined` means it is back on the feed's default. */
export function setFeedToggle(feed: string, key: string, encoded: unknown) {
  const all = readFeedToggles();
  const feedToggles = { ...(all[feed] ?? {}) };
  if (encoded === undefined) delete feedToggles[key];
  else feedToggles[key] = encoded;
  if (Object.keys(feedToggles).length) all[feed] = feedToggles;
  else delete all[feed];
  writeLS(TOGGLES_LS_KEY, serializeFeedToggles(all));
  announce();
}

/** "Reset toggles": every feed back to its stock filters, here and on the account. */
export function resetFeedToggles() {
  writeLS(TOGGLES_LS_KEY, null);
  try { sessionStorage.removeItem('feed-filter-states'); } catch { /* ignore */ }
  announce();
  window.dispatchEvent(new CustomEvent(FEED_TOGGLES_RELOAD_EVENT));
  window.dispatchEvent(new CustomEvent('feed-filters-changed'));
}

export function hasFeedToggles(): boolean {
  return Object.keys(readFeedToggles()).length > 0;
}

/**
 * Account values in (on sign-in or a profile refetch). Returns what changed so
 * the caller can move a feed that is still on the tab it opened with.
 */
export function adoptAccountFeedDefaults(customs: Record<string, unknown> | undefined) {
  const tabRaw = customs?.[DEFAULT_FEED_TAB_KEY];
  const togglesRaw = customs?.[FEED_TOGGLES_KEY];
  const hasTab = typeof tabRaw === 'string';
  const hasToggles = typeof togglesRaw === 'string';
  let tabChanged = false;
  let togglesChanged = false;
  if (hasTab) {
    const tab = parseDefaultFeedTab(tabRaw);
    tabChanged = tab !== readDefaultFeedTab();
    if (tabChanged) writeLS(TAB_LS_KEY, tab);
  }
  if (hasToggles) {
    const next = serializeFeedToggles(parseFeedToggles(togglesRaw));
    togglesChanged = next !== serializeFeedToggles(readFeedToggles());
    if (togglesChanged) writeLS(TOGGLES_LS_KEY, next === '{}' ? null : next);
  }
  return { hasTab, hasToggles, tabChanged, togglesChanged };
}

/** The pair as customs entries, for a profile save. */
export function feedDefaultsCustoms(): Record<string, string> {
  return {
    [DEFAULT_FEED_TAB_KEY]: readDefaultFeedTab(),
    [FEED_TOGGLES_KEY]: serializeFeedToggles(readFeedToggles()),
  };
}

let bootTab: string | null = null;

/**
 * Called once at boot: a fresh browser session (new tab, app reopened) starts
 * on the default feed. A reload in the same tab keeps the tab it was on, as it
 * always has. Writing the session entry here means every reader of it (home
 * page, collapsed feed nav, island capsule) agrees from the first frame.
 */
export function seedDefaultFeedTab() {
  try {
    if (sessionStorage.getItem(SESSION_SEEDED_KEY)) return;
    sessionStorage.setItem(SESSION_SEEDED_KEY, '1');
    if (sessionStorage.getItem(HOME_STATE_STORAGE_KEY)) return;
    const tab = readDefaultFeedTab();
    bootTab = tab;
    if (tab !== 'home') sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab }));
  } catch { /* storage blocked: plain Home */ }
}

/**
 * The account's default arrived after boot (first visit on this device). If
 * the viewer has not moved off the tab they opened on, take them to it.
 */
export function moveToAccountDefaultTab() {
  if (bootTab === null) return;
  const opened = bootTab;
  bootTab = null;
  let current = 'home';
  try {
    const saved = sessionStorage.getItem(HOME_STATE_STORAGE_KEY);
    if (saved) current = JSON.parse(saved)?.tab || 'home';
  } catch { /* ignore */ }
  const tab = readDefaultFeedTab();
  if (current !== opened || tab === current) return;
  const path = window.location.pathname;
  if (path !== '/app' && path !== '/') return;
  try { sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab })); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('switch-home-tab', { detail: tab }));
  window.dispatchEvent(new CustomEvent('home-tab-changed'));
}

