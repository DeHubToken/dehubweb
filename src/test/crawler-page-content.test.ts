/**
 * The 2026-09-13 Googlebot crawl found every profile, post and bounty page
 * under 200 words — 3,683 of 3,861 sitemap URLs, median 66 — and the feed
 * pages at 73–99. The crawler page was the title, the caption and the nav.
 * These cover the string builders that put the page's own substance into it:
 * the lists are escaped, junk titles fall back to the id, the shorts cut is
 * the SPA's duration rule, comments render with their author, and every
 * builder returns an empty string rather than an empty section when there is
 * nothing to show.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

function decl(signature: string): string {
  const start = WORKER.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2);
}
function constant(name: string): string {
  const line = WORKER.match(new RegExp(`^const ${name} = .*$`, 'm'));
  expect(line, name).not.toBeNull();
  return line![0];
}

type Row = Record<string, unknown>;
const api = new Function(`
  ${constant('APP_URL')}
  ${constant('UNTITLED_POST_TITLES')}
  ${constant('FILENAME_TITLE')}
  ${constant('PLACEHOLDER_TITLE')}
  ${decl('function escHtml(s = \'\') {')}
  ${decl('function truncate(text, max) {')}
  ${decl('function titleSaysNothing(title) {')}
  ${decl('function postLabel(row) {')}
  ${decl('function postListHtml(heading, rows, { author = true } = {}) {')}
  ${decl('function shortsOf(rows, max = 12) {')}
  ${decl('function commentsHtml(record) {')}
  ${decl('function postFactsHtml(record) {')}
  ${decl('function injectBeforeCta(html, sectionHtml) {')}
  ${decl('function profileAddressOf(html) {')}
  return { postListHtml, shortsOf, commentsHtml, postFactsHtml, injectBeforeCta, profileAddressOf };
`)() as {
  postListHtml: (heading: string, rows: Row[], opts?: { author?: boolean }) => string;
  shortsOf: (rows: Row[], max?: number) => Row[];
  commentsHtml: (record: Row | null) => string;
  postFactsHtml: (record: Row | null) => string;
  injectBeforeCta: (html: string, section: string) => string;
  profileAddressOf: (html: string) => string;
};

const video = (tokenId: number, name: string, extra: Row = {}): Row => ({
  tokenId, name, displayName: 'Trame e Recensioni', username: 'trameerecensioni', totalViews: 19, videoDuration: 330, ...extra,
});

describe('post lists', () => {
  it('links every row to its post, names the author and the views', () => {
    const out = api.postListHtml('Latest videos', [video(5660, 'G-Force – Superspie in missione')]);
    expect(out).toContain('<h2>Latest videos</h2>');
    expect(out).toContain('<a href="https://dehub.io/app/post/5660">G-Force – Superspie in missione</a> — by Trame e Recensioni · 19 views');
  });

  it('escapes what people typed', () => {
    const out = api.postListHtml('x', [video(1, '<script>alert(1)</script> & "quotes"', { displayName: 'A <b>' })]);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
    expect(out).toContain('by A &lt;b&gt;');
  });

  it('labels a junk title by its id rather than printing the filename', () => {
    const out = api.postListHtml('x', [video(122, 'VID-20220824-WA0031.mp4'), video(3674, '😍')]);
    expect(out).toContain('>Post #122</a>');
    expect(out).toContain('>Post #3674</a>');
    expect(out).not.toContain('VID-2022');
  });

  it("can leave the author off, for a page that is already the author's", () => {
    const out = api.postListHtml('Recent posts', [video(5660, 'A title')], { author: false });
    expect(out).not.toContain('by Trame');
    expect(out).toContain('19 views');
  });

  it('returns nothing at all when there are no rows or no usable ids', () => {
    expect(api.postListHtml('x', [])).toBe('');
    expect(api.postListHtml('x', [{ name: 'no id' }])).toBe('');
  });

  it('cuts a long title so a list line stays a line', () => {
    const out = api.postListHtml('x', [video(1, 'w'.repeat(200))]);
    expect(out).toContain('w'.repeat(89) + '…</a>');
  });
});

describe('shorts', () => {
  it('is any video under a minute, in order, capped', () => {
    const rows = [video(1, 'a', { videoDuration: 330 }), video(2, 'b', { videoDuration: 60 }), video(3, 'c', { videoDuration: 12 }), video(4, 'd', { videoDuration: 0 }), video(5, 'e', { videoDuration: 45 })];
    expect(api.shortsOf(rows).map((r) => r.tokenId)).toEqual([2, 3, 5]);
    expect(api.shortsOf(rows, 2).map((r) => r.tokenId)).toEqual([2, 3]);
  });
});

describe('comments', () => {
  const record = {
    commentCount: 130,
    comments: [
      { content: "That's a lot of comments!", user: { displayName: 'TheScientist', username: 'scientist' } },
      { content: 'second <b>bold</b>', writor: { username: 'someone' } },
      { content: '   ' },
    ],
  };

  it('renders each comment with who wrote it, escaped, under the real count', () => {
    const out = api.commentsHtml(record);
    expect(out).toContain('<h2>130 comments</h2>');
    expect(out).toContain('<li><strong>TheScientist</strong>: That&#39;s a lot of comments!</li>');
    expect(out).toContain('<li><strong>someone</strong>: second &lt;b&gt;bold&lt;/b&gt;</li>');
    expect(out.match(/<li>/g)!.length).toBe(2);
  });

  it('says "1 comment" for one, and nothing for none', () => {
    expect(api.commentsHtml({ commentCount: 1, comments: [{ content: 'hi' }] })).toContain('<h2>1 comment</h2>');
    expect(api.commentsHtml({ commentCount: 0, comments: [] })).toBe('');
    expect(api.commentsHtml(null)).toBe('');
  });
});

describe('post facts', () => {
  it('lists views, likes, a duration and the topics', () => {
    const out = api.postFactsHtml({ totalViews: 1234, reactionCounts: { like: 5 }, videoDuration: 330, category: ['ai', 'fun', ''] });
    expect(out).toContain('<p>1,234 views · 5 likes · 5:30</p>');
    expect(out).toContain('<p>Topics: ai, fun</p>');
  });

  it('is empty for nothing', () => {
    expect(api.postFactsHtml(null)).toBe('');
    expect(api.postFactsHtml({})).toBe('');
  });
});

describe('placement', () => {
  it('goes ahead of the "Open on DeHub" call to action on both page shapes', () => {
    const proxied = '<body><h1>x</h1>\n    <p><a class="dh-cta" href="u">View on DeHub</a></p></body>';
    const edge = '<body><h1>x</h1>\n<p style="margin-top:24px"><a class="dh-cta" href="u">Open x on DeHub</a></p></body>';
    for (const html of [proxied, edge]) {
      const out = api.injectBeforeCta(html, '<section>S</section>');
      expect(out.indexOf('<section>S</section>')).toBeLessThan(out.indexOf('class="dh-cta"'));
      expect(out.indexOf('<section>S</section>')).toBeGreaterThan(out.indexOf('<h1>'));
    }
  });

  it('falls back to the end of the body, and does nothing with nothing', () => {
    expect(api.injectBeforeCta('<body><p>a</p></body>', '<s>S</s>')).toBe('<body><p>a</p><s>S</s></body>');
    const html = '<body><p><a class="dh-cta">x</a></p></body>';
    expect(api.injectBeforeCta(html, '')).toBe(html);
  });
});

describe('profile wallet', () => {
  it('reads the address off the avatar URL, lower-cased', () => {
    const html = '<img src="https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/0xA65C2241DDCFE74171818E59256AD46A6BB115D9.jpg">';
    expect(api.profileAddressOf(html)).toBe('0xa65c2241ddcfe74171818e59256ad46a6bb115d9');
  });
  it('is empty when the page has no avatar', () => {
    expect(api.profileAddressOf('<img src="https://dehub.io/logo.png">')).toBe('');
  });
});

describe('wiring', () => {
  it('feeds the section pages, the music page, the post page and the profile page', () => {
    expect(WORKER).toContain('await sectionLiveHtml(sectionKey)');
    expect(WORKER).toContain("await sectionLiveHtml('music')");
    expect(WORKER).toContain('postListHtml(\'Recent posts\', await fetchFeedRows(`minter=${address}`)');
    expect(WORKER).toContain('commentsHtml(record)');
  });
});
