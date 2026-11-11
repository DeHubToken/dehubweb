/**
 * A category is a bare word. The server keeps whatever a post was saved with,
 * and older clients let people type "#business" or "@bollywood" into the
 * free-text box, or saved a whole picker selection ("mystery|||family
 * secrets") as one entry. Those came back from /get_categories verbatim and
 * rendered as hashtag- and mention-looking chips that match no post.
 */
export function normalizeCategoryName(raw: string): string {
  return raw
    .replace(/^[\s#@]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * DeHub is now Riftn, so its tags are too: "dehub" is "riftn", "dehub-wave"
 * is "riftn-wave", "dehubbers" are "rifters". The server moved the posts and
 * maps old names itself; this keeps an old #dehub link or a saved filter
 * showing the tag it now opens. Same rule as the backend's renamedCategory.
 */
export function renamedCategory(name: string): string {
  const lower = String(name ?? '').toLowerCase();
  if (!lower.includes('dehub')) return lower;
  return lower.replace(/dehubbers\b/g, 'rifters').replace(/dehubber\b/g, 'rifter').replace(/dehub/g, 'riftn');
}

/** One stored value may hold several categories — split, clean and drop empties. */
export function splitCategoryNames(raw: string): string[] {
  return raw
    .split(/\|\|\||,/)
    .map(normalizeCategoryName)
    .filter(Boolean);
}

/** Clean a list, deduping case-insensitively and keeping the first spelling. */
export function normalizeCategoryList(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    for (const name of splitCategoryNames(String(entry ?? ''))) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
