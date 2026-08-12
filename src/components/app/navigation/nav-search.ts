import type { NavItem } from '@/types/app.types';
import { NAV_LABEL_KEYS } from './SidebarNavItem';

/** Just the shape we need from react-i18next's `t`, so no version-pinned type. */
type TranslateFn = (key: string) => string;

/**
 * Menu search — shared by the desktop rail and the mobile menu sheet.
 *
 * This filters the NAVIGATION, not DeHub's content: the left panel carries 28
 * destinations in a box about nine rows tall, and that is the problem the field
 * is there to solve. Content search stays where it already is — the right rail
 * on desktop, and the Explore page, which both surfaces hand off to when the
 * thing being looked for is not a page.
 */

/** Where the "search DeHub for …" hand-off row points. */
export const exploreSearchHref = (query: string) =>
  `/app/explore?q=${encodeURIComponent(query.trim())}`;

/**
 * Case-insensitive substring match on the item's TRANSLATED label, so the field
 * works in the language the user is actually reading. The untranslated label is
 * matched too, which costs nothing and means a user typing "settings" on a
 * Turkish UI still lands on Ayarlar.
 *
 * Prefix matches sort ahead of mid-word ones; ties keep the menu's own order,
 * which Array#sort preserves.
 */
export function filterNavItems(items: NavItem[], query: string, t: TranslateFn): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items
    .map((item) => {
      const translated = t(NAV_LABEL_KEYS[item.label] || item.label).toLowerCase();
      const english = item.label.toLowerCase();
      const at = translated.includes(q) ? translated.indexOf(q) : english.indexOf(q);
      return { item, at };
    })
    .filter((entry) => entry.at !== -1)
    .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1))
    .map((entry) => entry.item);
}
