/**
 * How a link in user text is shown.
 *
 * A bare URL renders as the 🔗 chip. A URL wrapped in angle brackets —
 * `<riftn.com>` — renders as its own text, shortened in the middle when long.
 * The brackets are the markdown autolink convention, so text stays plain and
 * old posts keep rendering exactly as before.
 *
 * In the composer, one Backspace on a 🔗 chip flips it to the text form; one
 * more removes it.
 *
 * Links do not count toward a post's character limit.
 */

/** Links with a protocol, optionally wrapped as `<url>`. Used by the composer. */
export const createComposerLinkRegex = () => /<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>]+)/g;

/** Any URL-ish run, wrapped or bare, with or without a protocol — for counting only. */
const COUNT_LINK_REGEX = /<?(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%_+~#=]+(?:\.[-a-zA-Z0-9@:%_+~#=]+)*\.[a-zA-Z]{2,24}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)>?/g;

/** Wrap a URL so it renders as text rather than the 🔗 chip. */
export function asTextLink(url: string): string {
  return `<${url}>`;
}

/**
 * Shorten a URL for display: protocol and `www.` dropped, and anything past
 * `max` characters cut from the middle so both the domain and the end stay
 * readable — `example.com/articles/…/final-part`.
 */
export function abbreviateUrl(url: string, max = 36): string {
  const bare = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  if (bare.length <= max) return bare;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${bare.slice(0, head)}…${bare.slice(bare.length - tail)}`;
}

/** Characters of `text` that count toward the post limit: everything but links. */
export function countPostChars(text: string): number {
  let linkChars = 0;
  for (const m of text.matchAll(COUNT_LINK_REGEX)) {
    // Only things that look like links: a dot followed by letters, no spaces.
    if (/[a-zA-Z]{2,}/.test(m[0].split('.').pop() ?? '')) linkChars += m[0].length;
  }
  return text.length - linkChars;
}

/** Cut `text` so its counted length is at most `max`, never splitting a link. */
export function sliceToPostLimit(text: string, max: number): string {
  if (countPostChars(text) <= max) return text;
  let counted = 0;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(COUNT_LINK_REGEX)) {
    const before = text.slice(last, m.index);
    if (counted + before.length >= max) {
      return out + before.slice(0, max - counted);
    }
    out += before + m[0];
    counted += before.length;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + text.slice(last, last + (max - counted));
}
