import { describe, expect, it } from 'vitest';
import { abbreviateUrl, countPostChars, sliceToPostLimit } from '../link-display';
import { replaceLinksWithEmoji } from '@/components/app/TranslatableText';

describe('link display', () => {
  it('keeps short links whole and drops the protocol', () => {
    expect(abbreviateUrl('https://www.riftn.com/')).toBe('riftn.com');
  });

  it('shortens long links in the middle', () => {
    const out = abbreviateUrl('https://example.com/articles/2026/10/a-very-long-slug-that-goes-on-and-on');
    expect(out.length).toBe(36);
    expect(out.startsWith('example.com/')).toBe(true);
    expect(out).toContain('…');
    expect(out.endsWith('on-and-on')).toBe(true);
  });

  it('does not count links toward the limit', () => {
    expect(countPostChars('see riftn.com and <https://dehub.io/app>')).toBe('see  and '.length);
    expect(countPostChars('plain text')).toBe(10);
  });

  it('cuts text to the limit without splitting a link', () => {
    expect(sliceToPostLimit('ab https://x.com/long cdef', 5)).toBe('ab https://x.com/long c');
    expect(sliceToPostLimit('short', 10)).toBe('short');
  });

  it('keeps <url> as text when collapsing links to 🔗', () => {
    expect(replaceLinksWithEmoji('go to <riftn.com> or dehub.io')).toBe('go to <riftn.com> or 🔗');
  });
});
