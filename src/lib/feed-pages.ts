/**
 * Flattening paged feed responses into one list.
 *
 * `/api/feed` pages by offset, so a post published while someone is scrolling
 * shifts everything down and the next page repeats rows the previous one
 * already returned. Measured against production: three pages of 100 came back
 * with 306 posts and 301 distinct ids.
 *
 * Nothing downstream removed the repeat. The home feed mostly got away with it
 * because the per-author daily quota filter counts a duplicate twice and drops
 * the second copy — but that filter is skipped entirely under "following"
 * sort, and an author whose badge tier allows several posts a day has slots
 * spare for the duplicate to occupy. The interleaved feed pages three separate
 * queries, each overlapping on its own.
 *
 * First copy wins: it holds the earlier page's position, which is where the
 * reader has already scrolled past it.
 *
 * @module lib/feed-pages
 */

/** Anything the feed returns. Only the id fields are read. */
interface Identifiable {
  tokenId?: string | number | null;
  id?: string | number | null;
}

/** The id a feed row is deduplicated on, or null when it has none. */
function feedItemKey(item: Identifiable | null | undefined): string | null {
  if (!item) return null;
  const raw = item.tokenId ?? item.id;
  if (raw == null) return null;
  const key = String(raw).trim();
  return key === '' ? null : key;
}

/**
 * Flatten `pages` into one array, dropping any row whose id has already been
 * seen. Rows with no id of their own — carousel inserts, ads, placeholders —
 * are always kept, because they would otherwise all collapse into one.
 */
export function flattenFeedPages<T extends Identifiable>(
  pages: Array<{ items?: T[] | null }> | null | undefined,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const page of pages ?? []) {
    for (const item of page?.items ?? []) {
      const key = feedItemKey(item);
      if (key !== null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(item);
    }
  }

  return out;
}
