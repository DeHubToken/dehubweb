/**
 * Crawler HTML for a post, profile or community is not rendered by this
 * worker — it is proxied from the deployed `ssr-seo` Supabase function and
 * then patched on the way back out. That function only moves on a manual
 * `supabase functions deploy` nobody runs, so every correction to its output
 * lives in the proxy branch as a rewrite, and this is the newest one.
 *
 * What it repairs: a post has no title column, so its body text IS its title
 * there, interpolated with no whitespace collapsing and no length cap. A
 * sitemap crawl on 2026-09-01 found /app/post/3809 shipping 137 characters of
 * a multi-paragraph Turkish post as its <title>, /app/post/4676 shipping four
 * lines of hashtags across <title>, og:title, twitter:title and both image
 * alts, and profile bios running past 200 characters in the description.
 *
 * The functions are lifted out of the worker and evaluated here rather than
 * grepped, because what matters is the output for a nasty input — in
 * particular that a cut never lands inside one of the three HTML entities the
 * fn emits (`&quot;`, `&lt;`, `&gt;`) and leaves `&qu…` in an attribute.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

/** A whole declaration, never a byte window: a fixed slice starts failing on
 *  arrivals rather than on regressions (the lesson from bounty-urls.test.ts). */
function decl(signature: string): string {
  const start = WORKER.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2);
}

function constant(name: string): string {
  const re = new RegExp(`^const ${name} = .*$`, 'm');
  const line = WORKER.match(re);
  expect(line).not.toBeNull();
  return line![0];
}

const { normalizeProxiedMeta, reclamp } = new Function(`
  ${constant('TITLE_MAX')}
  ${constant('DESCRIPTION_MAX')}
  ${decl('function truncate(text, max) {')}
  ${decl('function reclamp(escaped, max) {')}
  ${decl('function normalizeProxiedMeta(html) {')}
  return { normalizeProxiedMeta, reclamp };
`)() as {
  normalizeProxiedMeta: (html: string) => string;
  reclamp: (escaped: string, max: number) => string;
};

const TITLE_MAX = Number(constant('TITLE_MAX').match(/\d+/)![0]);
const DESCRIPTION_MAX = Number(constant('DESCRIPTION_MAX').match(/\d+/)![0]);

/** The shape the deployed fn emits for a post, trimmed to the tags in play. */
const page = (title: string, description: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="https://dehub.io/app/post/4676">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/4676.jpg">
  <meta property="og:image:alt" content="${title}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image:alt" content="${title}">
</head>
</html>`;

const valueOf = (html: string, tag: string) =>
  tag === 'title'
    ? html.match(/<title>([\s\S]*?)<\/title>/)![1]
    : html.match(new RegExp(`(?:property|name)="${tag}" content="([\\s\\S]*?)">`))![1];

const TITLE_TAGS = ['title', 'og:title', 'og:image:alt', 'twitter:title', 'twitter:image:alt'];
const DESCRIPTION_TAGS = ['description', 'og:description', 'twitter:description'];

describe('proxied meta normalisation', () => {
  it('caps every title tag, not just <title>', () => {
    const long = 'MESSI HAT-TRICK! Argentina (3-0) Algeria FIFA WORLD CUP 2026 and then some more';
    const out = normalizeProxiedMeta(page(long, 'short'));
    for (const tag of TITLE_TAGS) {
      expect(valueOf(out, tag).length).toBe(TITLE_MAX);
      expect(valueOf(out, tag).endsWith('…')).toBe(true);
    }
  });

  it('caps every description tag', () => {
    const out = normalizeProxiedMeta(page('short', 'b'.repeat(400)));
    for (const tag of DESCRIPTION_TAGS) {
      expect(valueOf(out, tag).length).toBe(DESCRIPTION_MAX);
    }
  });

  it('collapses the newlines a multi-paragraph post carries into every tag', () => {
    const out = normalizeProxiedMeta(page('one\n\ntwo\nthree', 'alpha\nbeta'));
    for (const tag of [...TITLE_TAGS, ...DESCRIPTION_TAGS]) {
      expect(valueOf(out, tag)).not.toMatch(/\n/);
    }
    expect(valueOf(out, 'title')).toBe('one two three');
    expect(valueOf(out, 'og:description')).toBe('alpha beta');
  });

  it('leaves copy that is already short and single-line exactly as it was', () => {
    const html = page('First Dehub Stream', 'Post by Top Streamer on DeHub.');
    expect(normalizeProxiedMeta(html)).toBe(html);
  });

  /**
   * The rewrite must not reach the image, the canonical or the JSON-LD — the
   * card swap that runs after it matches on og:image, and the fn's JSON-LD is
   * escaped by JSON.stringify rather than by HTML entities.
   */
  it('touches no tag outside titles and descriptions', () => {
    const out = normalizeProxiedMeta(page('x'.repeat(200), 'y'.repeat(400)));
    expect(out).toContain('<link rel="canonical" href="https://dehub.io/app/post/4676">');
    expect(out).toContain('images/4676.jpg');
  });

  /**
   * The fn escapes exactly `"`, `<` and `>`. Slicing the escaped form can land
   * mid-entity and emit `&qu…` into an attribute, so the cut is made on the
   * decoded string and the three are put back afterwards.
   */
  it('never cuts an HTML entity in half', () => {
    const cut = reclamp(`${'x'.repeat(TITLE_MAX - 6)}&quot;tail&quot; and more`, TITLE_MAX);
    expect(cut).not.toMatch(/&(?:q|qu|quo|quot|l|g|lt|gt)$/);
    expect(cut.replace(/&(?:quot|lt|gt|amp);/g, '')).not.toContain('&');
  });

  it('round-trips the three entities the fn emits, and leaves a bare & alone', () => {
    expect(reclamp('He said &quot;buy&quot; then left', 70)).toBe('He said &quot;buy&quot; then left');
    expect(reclamp('3 &lt; 5 &gt; 1', 70)).toBe('3 &lt; 5 &gt; 1');
    expect(reclamp('Rock &amp; Roll', 70)).toBe('Rock &amp; Roll');
  });

  it('is wired into the proxy branch, after the profile-title rewrite', () => {
    const call = WORKER.indexOf('html = normalizeProxiedMeta(html);');
    const profileTitle = WORKER.indexOf('on DeHub — posts, videos &amp; profile');
    expect(profileTitle).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(profileTitle);
  });
});
