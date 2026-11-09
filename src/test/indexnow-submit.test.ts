// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { changedUrls, parseSitemap } from '../../scripts/indexnow-submit.mjs';

const xml = (rows: Array<[string, string?]>) => `<urlset>${rows.map(([loc, lm]) => `<url><loc>${loc}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`).join('')}</urlset>`;

describe('IndexNow submit', () => {
  it('sends every riftn.com URL on a full submit', () => {
    const cur = parseSitemap(xml([['https://riftn.com/a', '1'], ['https://riftn.com/b?hl=es&amp;x=1'], ['https://dehub.io/c']]));
    expect(changedUrls(cur, null)).toEqual(['https://riftn.com/a', 'https://riftn.com/b?hl=es&x=1']);
  });

  it('sends only new or changed pages after a deploy', () => {
    const prev = parseSitemap(xml([['https://riftn.com/a', '1'], ['https://riftn.com/b', '1']]));
    const cur = parseSitemap(xml([['https://riftn.com/a', '1'], ['https://riftn.com/b', '2'], ['https://riftn.com/new', '1']]));
    expect(changedUrls(cur, prev)).toEqual(['https://riftn.com/b', 'https://riftn.com/new']);
  });
});
