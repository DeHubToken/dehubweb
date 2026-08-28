/**
 * extractUrlsFromText used to require an explicit http(s):// scheme, so a
 * bare "dehub.io/work" typed into a comment or caption never got a preview
 * card even though TranslatableText's own linkifier already turns the exact
 * same text into a clickable link. These pin the scheme-optional match and
 * the normalization that keeps every downstream caller (the fetch, cache
 * keys, `new URL(...)`) working with an absolute URL.
 */
import { describe, it, expect } from 'vitest';
import { extractUrlsFromText } from '@/lib/api/link-preview';

describe('extractUrlsFromText', () => {
  it('matches a scheme-less domain and normalizes it to https', () => {
    expect(extractUrlsFromText('check this out: dehub.io/work')).toEqual([
      'https://dehub.io/work',
    ]);
  });

  it('leaves an already-schemed URL as written', () => {
    expect(extractUrlsFromText('see http://dehub.io/work now')).toEqual([
      'http://dehub.io/work',
    ]);
  });

  it('strips trailing sentence punctuation before normalizing', () => {
    expect(extractUrlsFromText('link: dehub.io/work.')).toEqual(['https://dehub.io/work']);
    expect(extractUrlsFromText('is this it (dehub.io/work)?')).toEqual(['https://dehub.io/work']);
  });

  it('requires a path, so a bare domain with no slash is not a URL', () => {
    expect(extractUrlsFromText('reach out at hello@dehub.io')).toEqual([]);
  });

  it('does not match plain decimals or filenames', () => {
    expect(extractUrlsFromText('up 2.5x today, see report.pdf')).toEqual([]);
  });

  it('dedupes repeated links, keyed by the normalized form', () => {
    const found = extractUrlsFromText('dehub.io/work and again https://dehub.io/work');
    expect(found).toEqual(['https://dehub.io/work']);
  });

  it('returns an empty array for text with no links', () => {
    expect(extractUrlsFromText('just a regular sentence')).toEqual([]);
  });
});
