/**
 * Nav order
 * =========
 * The order a person dragged their menus into. Three lists, one per surface:
 *
 *   - `menu` the phone menu sheet's tile grid (shared with the app's drawer)
 *   - `rail` the desktop side panel
 *   - `bar`  the phone bottom nav pill (shared with the app's bottom bar)
 *
 * Each is a list of ids, never of items: an id is the destination's i18n key
 * (`nav.home`, `nav.notifications`), which is what the app keys the same
 * destinations by, so an order set on the phone carries over to the app.
 *
 * Saved to localStorage first (instant paint, and the whole story when signed
 * out) and pushed to the account's preference blob when signed in, so the
 * order follows the account to other devices. The inbound half is registered
 * once in ViewingPreferencesSync.
 *
 * Kept small and dependency free: the bottom bar reads it on the boot path.
 *
 * @module lib/nav-order
 */

import { useSyncExternalStore } from 'react';

export type NavOrderSurface = 'menu' | 'rail' | 'bar';

/** Keys in the account's preference blob. Same names in dehub-mobile. */
export const NAV_ORDER_PREF_KEYS: Record<NavOrderSurface, string> = {
  menu: 'menuOrder',
  rail: 'railOrder',
  bar: 'barOrder',
};

const STORAGE_PREFIX = 'dehub.navOrder.';
const CHANGE_EVENT = 'nav-order-changed';
const EMPTY: string[] = [];
const MAX_IDS = 200;

export function sanitiseNavOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return EMPTY;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !id || id.length > 80 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

// One parsed snapshot per surface, keyed on the raw string, so
// useSyncExternalStore gets a stable array until the stored value changes.
const cache = new Map<NavOrderSurface, { raw: string | null; ids: string[] }>();

export function readNavOrder(surface: NavOrderSurface): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_PREFIX + surface);
  } catch {
    raw = null;
  }
  const hit = cache.get(surface);
  if (hit && hit.raw === raw) return hit.ids;
  let ids = EMPTY;
  if (raw) {
    try {
      ids = sanitiseNavOrder(JSON.parse(raw));
    } catch {
      ids = EMPTY;
    }
  }
  cache.set(surface, { raw, ids });
  return ids;
}

export function writeNavOrder(surface: NavOrderSurface, ids: string[]) {
  const clean = sanitiseNavOrder(ids);
  try {
    if (clean.length) localStorage.setItem(STORAGE_PREFIX + surface, JSON.stringify(clean));
    else localStorage.removeItem(STORAGE_PREFIX + surface);
  } catch {
    /* private mode / quota: the order still applies until reload */
    cache.set(surface, { raw: clean.length ? JSON.stringify(clean) : null, ids: clean });
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: surface }));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useNavOrder(surface: NavOrderSurface): string[] {
  return useSyncExternalStore(subscribe, () => readNavOrder(surface), () => EMPTY);
}

/**
 * Put `items` in the saved order. Anything the saved order doesn't know (a
 * destination added since, or one only the other platform has) keeps its
 * default spot: it goes straight after the item it follows by default.
 */
export function applyNavOrder<T>(items: T[], order: string[], idOf: (item: T) => string): T[] {
  if (!order.length) return items;
  const byId = new Map<string, T>();
  items.forEach((item) => byId.set(idOf(item), item));
  const placed: T[] = [];
  const used = new Set<string>();
  for (const id of order) {
    const item = byId.get(id);
    if (item !== undefined && !used.has(id)) {
      placed.push(item);
      used.add(id);
    }
  }
  if (used.size === items.length) return placed;
  items.forEach((item, index) => {
    const id = idOf(item);
    if (used.has(id)) return;
    // Find the nearest default predecessor that is already placed.
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = placed.indexOf(items[i]);
      if (prev >= 0) {
        at = prev + 1;
        break;
      }
    }
    placed.splice(at, 0, item);
    used.add(id);
  });
  return placed;
}

/**
 * The full list to save after a drag. `visible` is the new order of what was
 * on screen; ids the screen didn't show (filtered out here, or only known to
 * the other platform) keep their place after the id they followed before.
 */
export function mergeNavOrder(previous: string[], visible: string[]): string[] {
  const result = [...visible];
  const inResult = new Set(result);
  previous.forEach((id, index) => {
    if (inResult.has(id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = result.indexOf(previous[i]);
      if (prev >= 0) {
        at = prev + 1;
        break;
      }
    }
    result.splice(at, 0, id);
    inResult.add(id);
  });
  return result;
}
