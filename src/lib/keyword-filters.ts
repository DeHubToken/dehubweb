/**
 * Keyword filter matching
 * =======================
 * Decides whether a post (or a comment) trips one of the viewer's keyword
 * filters, and where on the site a filter applies. Kept free of React so the
 * same rule can be tested on its own — dehub-mobile libs/keyword-filters.ts is
 * the same function, and the two should not drift.
 *
 * - Case-insensitive.
 * - `wholeWord` matches the phrase between non-letter, non-digit characters,
 *   so "cat" does not catch "category" (a script with no spaces between
 *   words, like Chinese, only matches with whole-word off — as on Mastodon).
 * - A "hide" filter wins over a "warn" one when both match.
 * - Expired filters never match, even before the server has removed them.
 */
import type { FilterContext, KeywordFilter } from '@/lib/api/dehub/keyword-filters';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patternCache = new Map<string, RegExp>();

function patternFor(filter: Pick<KeywordFilter, 'phrase' | 'wholeWord'>): RegExp {
  const key = `${filter.wholeWord ? 'w' : 's'}:${filter.phrase}`;
  let pattern = patternCache.get(key);
  if (!pattern) {
    const phrase = escapeRegex(filter.phrase.trim()).replace(/\s+/g, '\\s+');
    pattern = filter.wholeWord
      ? new RegExp(`(^|[^\\p{L}\\p{N}_])${phrase}(?=$|[^\\p{L}\\p{N}_])`, 'iu')
      : new RegExp(phrase, 'iu');
    patternCache.set(key, pattern);
  }
  return pattern;
}

/** The first filter the text trips in this place, "hide" before "warn"; null when none does. */
export function matchKeywordFilter(
  texts: Array<string | null | undefined>,
  filters: KeywordFilter[] | null | undefined,
  context: FilterContext,
  now = Date.now(),
): KeywordFilter | null {
  if (!filters?.length) return null;
  const text = texts.filter(Boolean).join('\n');
  if (!text) return null;
  let warn: KeywordFilter | null = null;
  for (const filter of filters) {
    if (!filter.phrase?.trim()) continue;
    if (filter.expiresAt && Date.parse(filter.expiresAt) <= now) continue;
    if (filter.contexts?.length && !filter.contexts.includes(context)) continue;
    if (!patternFor(filter).test(text)) continue;
    if (filter.action === 'hide') return filter;
    warn ??= filter;
  }
  return warn;
}

/**
 * Which filter context a page belongs to, from its path. The cards render on
 * every surface, so they read the place from the route rather than being told.
 */
export function filterContextForPath(pathname: string): FilterContext {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/home' || path === '/following') return 'home';
  if (/^\/(posts?|newpost|video)\//.test(path)) return 'thread';
  if (path.startsWith('/notifications')) return 'notifications';
  if (/^\/(explore|search|tags?|hashtag|trending|discover|categor(y|ies)|music|videos|shorts|stages)(\/|$)/.test(path)) {
    return 'public';
  }
  // Profiles live at /:username, and your own at /profile.
  if (path === '/profile' || /^\/[^/]+$/.test(path)) return 'profile';
  return 'home';
}
