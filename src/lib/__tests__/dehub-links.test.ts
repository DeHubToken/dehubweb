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
import { findDehubLinks } from '@/lib/dehub-links';

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
