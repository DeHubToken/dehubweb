/**
 * Feed filter presets: a named set of Home feed filters a viewer saved, picked
 * again with one tap from the filter panel.
 *
 * Kept on the account in `customs.feedPresets` beside `feedToggles` (see
 * lib/feed-defaults), so they follow the viewer to every device, and the app
 * reads the same key (dehub-mobile libs/feed-presets.ts). A customs value is a
 * flat string of at most 500 characters, so a preset is stored small:
 *   { n: name, s?: sort value, d?: date value, p?: post type, c?: categories, a?: access }
 * Only filters that differ from the feed's stock value are written.
 *
 * @module lib/feed-presets
 */

export const FEED_PRESETS_KEY = 'feedPresets';
const PRESETS_LS_KEY = 'dehub:feedPresets';
const MAX_CUSTOMS_VALUE = 500;
export const MAX_FEED_PRESETS = 6;
export const MAX_PRESET_NAME = 24;

/** Fired on window when the saved presets change here or arrive from the account. */
export const FEED_PRESETS_CHANGED_EVENT = 'feed-presets-changed';
/** "+ Save current" in the filter panel asks the filter line to open in save mode. */
export const FEED_FILTER_LINE_SAVE_EVENT = 'feed-filter-line-save';

export type PresetAccess = 'ppv' | 'w2e' | 'locked';

export interface FeedFilterPreset {
  name: string;
  sort?: string;
  date?: string;
  postType?: string;
  categories?: string[];
  access?: PresetAccess[];
}

const ACCESS: readonly PresetAccess[] = ['ppv', 'w2e', 'locked'];

function readLS(): string | null {
  try { return localStorage.getItem(PRESETS_LS_KEY); } catch { return null; }
}
function writeLS(value: string | null) {
  try {
    if (value === null || value === '[]') localStorage.removeItem(PRESETS_LS_KEY);
    else localStorage.setItem(PRESETS_LS_KEY, value);
  } catch { /* storage full or blocked */ }
}

const str = (v: unknown, max = 40): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

export function parseFeedPresets(raw: unknown): FeedFilterPreset[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: FeedFilterPreset[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const name = str(item.n, MAX_PRESET_NAME);
      if (!name) continue;
      const preset: FeedFilterPreset = { name };
      const sort = str(item.s); if (sort) preset.sort = sort;
      const date = str(item.d); if (date) preset.date = date;
      const postType = str(item.p); if (postType) preset.postType = postType;
      if (Array.isArray(item.c)) {
        const cats = item.c.map((c: unknown) => str(c)).filter(Boolean) as string[];
        if (cats.length) preset.categories = cats;
      }
      if (Array.isArray(item.a)) {
        const access = item.a.filter((a: unknown): a is PresetAccess => ACCESS.includes(a as PresetAccess));
        if (access.length) preset.access = access;
      }
      out.push(preset);
      if (out.length >= MAX_FEED_PRESETS) break;
    }
    return out;
  } catch {
    return [];
  }
}

function encode(preset: FeedFilterPreset) {
  const o: Record<string, unknown> = { n: preset.name };
  if (preset.sort) o.s = preset.sort;
  if (preset.date) o.d = preset.date;
  if (preset.postType) o.p = preset.postType;
  if (preset.categories?.length) o.c = preset.categories;
  if (preset.access?.length) o.a = preset.access;
  return o;
}

/** Compact JSON that fits a customs value: oldest presets drop first when it doesn't. */
export function serializeFeedPresets(presets: FeedFilterPreset[]): string {
  let list = presets.slice(0, MAX_FEED_PRESETS);
  let json = JSON.stringify(list.map(encode));
  while (json.length > MAX_CUSTOMS_VALUE && list.length > 0) {
    list = list.slice(0, -1);
    json = JSON.stringify(list.map(encode));
  }
  return json;
}

export function readFeedPresets(): FeedFilterPreset[] {
  return parseFeedPresets(readLS());
}

function store(presets: FeedFilterPreset[]) {
  writeLS(serializeFeedPresets(presets));
  window.dispatchEvent(new CustomEvent(FEED_PRESETS_CHANGED_EVENT));
  // FeedDefaultsSync pushes every feed default (presets included) on this event.
  window.dispatchEvent(new CustomEvent('feed-defaults-changed'));
}

/** Newest first; a preset with the same name is replaced. */
export function saveFeedPreset(preset: FeedFilterPreset) {
  const name = preset.name.trim().slice(0, MAX_PRESET_NAME);
  if (!name) return;
  const rest = readFeedPresets().filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  store([{ ...preset, name }, ...rest]);
}

export function deleteFeedPreset(name: string) {
  store(readFeedPresets().filter((p) => p.name !== name));
}

/** True when the preset holds exactly these filters. */
export function presetMatches(preset: FeedFilterPreset, current: FeedFilterPreset): boolean {
  const same = (a?: string[], b?: string[]) => {
    const x = [...(a ?? [])].sort().join('|');
    const y = [...(b ?? [])].sort().join('|');
    return x === y;
  };
  return (preset.sort ?? '') === (current.sort ?? '')
    && (preset.date ?? '') === (current.date ?? '')
    && (preset.postType ?? '') === (current.postType ?? '')
    && same(preset.categories, current.categories)
    && same(preset.access, current.access);
}

/** Account value in. Returns true when the local copy changed. */
export function adoptAccountFeedPresets(customs: Record<string, unknown> | undefined): { has: boolean; changed: boolean } {
  const raw = customs?.[FEED_PRESETS_KEY];
  if (typeof raw !== 'string') return { has: false, changed: false };
  const next = serializeFeedPresets(parseFeedPresets(raw));
  const changed = next !== serializeFeedPresets(readFeedPresets());
  if (changed) {
    writeLS(next);
    window.dispatchEvent(new CustomEvent(FEED_PRESETS_CHANGED_EVENT));
  }
  return { has: true, changed };
}

export function feedPresetsCustoms(): Record<string, string> {
  return { [FEED_PRESETS_KEY]: serializeFeedPresets(readFeedPresets()) };
}
