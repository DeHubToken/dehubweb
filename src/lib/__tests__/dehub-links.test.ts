/**
 * The host rule: a card is a claim that the content is DeHub's, so only our own
 * hosts (and host-less paths, which can only be ours) may produce one.
 *
 * findDehubLinks scans twice — once for whole URLs, once for bare in-app paths.
 * The first pass used to record a claimed span only when a match succeeded, so a
 * URL rejected for being on somebody else's host left its span open and the
 * bare-path pass matched the "/app/post/1" inside it, carding a third-party link
 * as ours.
 */
import { describe, it, expect } from 'vitest';
import { findDehubLinks, parseDehubLink } from '@/lib/dehub-links';

describe('findDehubLinks /posts short form', () => {
  it('cards the bare short post link', () => {
    const m = parseDehubLink('https://dehub.io/posts/1');
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('post');
    expect(m!.tokenId).toBe('1');
  });

  it('cards the thread form and keeps the path as written', () => {
    const m = parseDehubLink('https://dehub.io/posts/1/b');
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('post');
    expect(m!.path).toBe('/posts/1/b');
  });

  it('carries a thread-entry comment id', () => {
    const m = parseDehubLink('https://dehub.io/posts/1/b/55');
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('post');
    expect(m!.tokenId).toBe('1');
    expect(m!.commentId).toBe('55');
  });

  it('cards a bare thread path, which can only be ours', () => {
    const found = findDehubLinks('thread: /posts/3/b/9');
    expect(found).toHaveLength(1);
    expect(found[0].commentId).toBe('9');
  });

  it('rejects junk under /posts', () => {
    expect(parseDehubLink('https://dehub.io/posts/abc')).toBeNull();
    expect(parseDehubLink('https://dehub.io/posts/1/x')).toBeNull();
    expect(parseDehubLink('https://dehub.io/posts/1/b/notanid')).toBeNull();
  });
});

describe('findDehubLinks host rule', () => {
  it('cards our own links', () => {
    expect(findDehubLinks('https://dehub.io/app/post/2')).toHaveLength(1);
    expect(findDehubLinks('https://dehub.io/app/post/2')[0].tokenId).toBe('2');
  });

  it('cards a bare in-app path, which can only be ours', () => {
    const found = findDehubLinks('see /app/post/2 for details');
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('post');
  });

  it('ignores links to other sites', () => {
    expect(findDehubLinks('https://example.com/app/post/1')).toEqual([]);
  });

  it('does not card a foreign URL through its path', () => {
    expect(findDehubLinks('look at https://evil.example/app/post/1 now')).toEqual([]);
    expect(findDehubLinks('https://example.com/communities/dehub')).toEqual([]);
    // Scheme-less, which is the case that pins the regex: ABSOLUTE_URL_RE makes
    // https?:// optional, so pass 1 still claims this span and rejects it on the
    // host check. Require the scheme and pass 2 reads the trailing /app/post/1
    // as a host-less path — which can only be ours — and cards it.
    expect(findDehubLinks('example.com/app/post/1')).toEqual([]);
  });

  it('rejects a lookalike host', () => {
    // Suffix matching has to be on a dot boundary, not a substring.
    expect(findDehubLinks('https://dehub.io.attacker.com/app/post/9')).toEqual([]);
  });

  it('still finds our own link when a foreign one sits beside it', () => {
    const found = findDehubLinks('https://example.com/app/post/1 and https://dehub.io/app/post/2');
    expect(found).toHaveLength(1);
    expect(found[0].tokenId).toBe('2');
  });

  it('finds a bare path alongside a full URL', () => {
    const found = findDehubLinks('see /app/post/2 or https://dehub.io/app/events/3');
    expect(found.map((l) => l.kind).sort()).toEqual(['event', 'post']);
  });

  it('handles empty input', () => {
    expect(findDehubLinks('')).toEqual([]);
    expect(findDehubLinks(null)).toEqual([]);
    expect(findDehubLinks(undefined)).toEqual([]);
  });
});

/**
 * /cinema links.
 *
 * Two things are being pinned here. The first is that a title cards up at all
 * — the share button builds these URLs, and a link that does not parse posts
 * as bare blue text.
 *
 * The second is the collision that shipped with the route: /cinema was missing
 * from RESERVED_ROOT_SEGMENTS, so `dehub.io/cinema` pasted into a post parsed
 * as a PROFILE link for a user called "cinema" and carded up as somebody's
 * profile. Every top-level route has to be in that list; this is the test that
 * remembers why.
 */
describe('findDehubLinks /cinema', () => {
  it('cards a film', () => {
    const m = parseDehubLink('https://dehub.io/cinema/film/12345');
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('film');
    expect(m!.filmId).toBe('12345');
    expect(m!.filmObjectType).toBe('movie');
  });

  it('maps the readable "series" segment onto the API object type', () => {
    // The URL says series because people read it; the offers endpoint wants
    // 'show'. Getting this backwards fetches the wrong catalogue and the card
    // silently falls back to a chip.
    const m = parseDehubLink('https://dehub.io/cinema/series/678');
    expect(m!.kind).toBe('film');
    expect(m!.filmObjectType).toBe('show');
  });

  it('does not read the hub page as a profile called "cinema"', () => {
    const m = parseDehubLink('https://dehub.io/cinema');
    expect(m).toBeNull();
  });

  it('rejects a type segment that is not film or series', () => {
    expect(parseDehubLink('https://dehub.io/cinema/documentary/12')).toBeNull();
  });

  it('rejects a non-numeric id', () => {
    expect(parseDehubLink('https://dehub.io/cinema/film/dune')).toBeNull();
  });

  it('does not card a foreign host through the cinema path', () => {
    expect(parseDehubLink('https://evil.example/cinema/film/1')).toBeNull();
  });
});
