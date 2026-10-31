import { describe, expect, it } from 'vitest';
import { articleHeadings, articleLinkBlocks } from '@/lib/article';

describe('articleLinkBlocks', () => {
  it('keeps only the titled link when an address is pasted then linked', () => {
    const body = 'Look at this story:\r\nhttps://example.com/blog/a\r\n[All hope is lost](https://example.com/blog/a)\r\n\r\nNext.';
    expect(articleLinkBlocks(body)).toBe('Look at this story:\n\n[All hope is lost](https://example.com/blog/a)\n\nNext.');
  });

  it('puts an address on its own line in its own block as a link', () => {
    expect(articleLinkBlocks('Before\nhttps://example.com/x\nAfter')).toBe('Before\n\n<https://example.com/x>\n\nAfter');
  });

  it('links bare addresses in running text without the trailing full stop', () => {
    expect(articleLinkBlocks('See https://example.com/a. Thanks')).toBe('See <https://example.com/a>. Thanks');
  });

  it('leaves existing links, autolinks, images and code alone', () => {
    const lines = [
      'A [label https://x.com](https://x.com) link',
      'An <https://y.com> autolink',
      '![pic](https://z.com/p.png)',
      'Code `https://c.com` here',
      '```',
      'https://fenced.com',
      '```',
    ].join('\n');
    expect(articleLinkBlocks(lines)).toBe(lines);
  });

  it('keeps heading ids the same', () => {
    const body = '# One\nhttps://example.com\n## Two';
    expect(articleHeadings(articleLinkBlocks(body)).map(h => h.id)).toEqual(articleHeadings(body).map(h => h.id));
  });
});
