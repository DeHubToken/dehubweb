/**
 * The prerendered pages are what a crawler indexes and what anybody who opens
 * a shared link outside an ordinary browser actually sees. They used to be raw
 * markup — pale-green links, a #00ff00 button, sans-serif on black — and now
 * they carry the app's own look, applied once in guard() rather than in each of
 * the dozen builders.
 *
 * The transform edits real HTML with regular expressions, so what needs
 * guarding is that it never eats the parts a crawler came for: the meta tags,
 * the JSON-LD, the copy and the links. These run the real function over the
 * real shapes both sources emit.
 */
import { describe, expect, it } from 'vitest';
import { stylePrerendered } from '../../CLOUDFLARE_WORKER_SEO.js';

/** The shape the ssr-seo function emits: inline styles, self-linking CTA. */
const FN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Someone invited you to DeHub</title>
  <meta name="description" content="Use invite code ABC123 to join DeHub.">
  <meta property="og:image" content="https://dehub.io/card.jpg">
  <link rel="canonical" href="https://dehub.io/r/ABC123">
  <script type="application/ld+json">{"@type":"WebPage","name":"Invite"}</script>
</head>
<body style="font-family: sans-serif; background: black; color: white; display: flex;">
  <div style="max-width: 720px; text-align: center; padding: 20px;">
    <h1>Someone invited you to DeHub</h1>
    <p>Use invite code ABC123 to join DeHub.</p>
    <img src="https://dehub.io/card.jpg" style="max-width: 100%;" alt="Invite" />
    <p style="margin-top: 30px;"><a class="dh-cta" href="https://dehub.io/r/ABC123?app=1" rel="nofollow">View on DeHub</a></p>
    <nav style="margin-top: 20px;">
      <a href="https://dehub.io/app/explore" style="color: #aaa; margin: 0 8px;">Explore</a>
    </nav>
  </div>
</body>
</html>`;

/** The shape this worker's own builders emit. */
const WORKER_PAGE = `<!DOCTYPE html>
<html lang="en">
<head><title>DeHub Docs — Overview</title><meta name="description" content="What DeHub is."></head>
<body>
<p><a href="https://dehub.io/">DeHub</a> › Overview</p>
<h1>Overview</h1>
<p>What DeHub is.</p>
<nav aria-label="DeHub sections"><h2>Explore DeHub</h2><ul><li><a href="https://dehub.io/app/music">Music</a></li></ul></nav>
</body>
</html>`;

const count = (html: string, re: RegExp) => (html.match(re) || []).length;
const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('stylePrerendered keeps everything a crawler came for', () => {
  for (const [name, page] of [['ssr-seo page', FN_PAGE], ['worker-built page', WORKER_PAGE]] as const) {
    it(`keeps every meta tag on the ${name}`, () => {
      const before = count(page, /<meta [^>]*>/g);
      expect(count(stylePrerendered(page), /<meta [^>]*>/g)).toBe(before);
    });

    it(`keeps the copy on the ${name}`, () => {
      // The shell adds a footer sentence; nothing may be removed.
      for (const word of text(page).split(' ')) {
        expect(text(stylePrerendered(page))).toContain(word);
      }
    });

    it(`keeps every link on the ${name}, and adds the shell's`, () => {
      const out = stylePrerendered(page);
      for (const href of page.match(/href="[^"]*"/g) || []) expect(out).toContain(href);
      expect(count(out, /<a [^>]*href=/g)).toBeGreaterThan(count(page, /<a [^>]*href=/g));
    });
  }

  it('leaves JSON-LD untouched', () => {
    expect(stylePrerendered(FN_PAGE)).toContain('<script type="application/ld+json">{"@type":"WebPage","name":"Invite"}</script>');
  });

  it('keeps the canonical', () => {
    expect(stylePrerendered(FN_PAGE)).toContain('<link rel="canonical" href="https://dehub.io/r/ABC123">');
  });
});

describe('stylePrerendered applies the site look', () => {
  it('wraps the page in the DeHub shell', () => {
    const out = stylePrerendered(FN_PAGE);
    expect(out).toContain('class="dh-head"');
    expect(out).toContain('class="dh-main"');
    expect(out).toContain('class="dh-foot"');
    expect(out).toContain('dehub-header-logo.png');
  });

  it('loads Exo and inlines the stylesheet, so the page renders from one request', () => {
    const out = stylePrerendered(FN_PAGE);
    expect(out).toContain('family=Exo');
    expect(out).toMatch(/<style>[\s\S]*\.dh-main\{/);
    expect(out).not.toContain('.css"');
  });

  /**
   * The whole point: an inline style outranks the sheet, and every one of these
   * documents was full of them. #00ff00 and #9f9 have to be gone, not overridden.
   */
  it('strips every inline style attribute', () => {
    const out = stylePrerendered(FN_PAGE).split(/<style[\s\S]*?<\/style>/).join('');
    expect(out).not.toMatch(/ style="/);
    expect(out).not.toContain('#00ff00');
    expect(out).not.toContain('#9f9');
  });

  it('does not touch style attributes written inside a script', () => {
    const withScript = FN_PAGE.replace(
      '</head>',
      '<script>var t = \'<p style="color:red">hi</p>\';</script></head>',
    );
    expect(stylePrerendered(withScript)).toContain('<p style="color:red">hi</p>');
  });

  it('runs once — a page it already shelled comes back unchanged', () => {
    const once = stylePrerendered(FN_PAGE);
    expect(stylePrerendered(once)).toBe(once);
  });

  it('leaves anything that is not a document alone', () => {
    expect(stylePrerendered('{"ok":true}')).toBe('{"ok":true}');
    expect(stylePrerendered('<svg><rect style="fill:red"/></svg>')).toBe('<svg><rect style="fill:red"/></svg>');
  });
});
