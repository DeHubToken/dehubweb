import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const POST_PAGE = readFileSync(resolve(__dirname, '../pages/app/SinglePostPage.tsx'), 'utf8');
const HOME_FEED = readFileSync(resolve(__dirname, '../components/app/feeds/HomeFeed.tsx'), 'utf8');
const INDEX_CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const OSAKA_CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
const JUNGLE_CSS = readFileSync(resolve(__dirname, '../styles/jungle-theme.css'), 'utf8');

/** The bento class HomeFeed wraps every feed card in. */
const BENTO = 'rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3';

/**
 * A post opened on its own page must look like the same post in the feed.
 *
 * It stopped doing so once its wrapper was tagged [data-post-shell] and the
 * canvas themes stripped the glass off it — on the reading that the wrapper was
 * the page's full-height middle column. It never was: it holds the post and its
 * poll, and the related feeds are siblings outside it. These lock the wrapper to
 * the feed's own bento, and lock out the two rules that used to un-paint it.
 */
describe('dedicated post page — the post keeps its bento', () => {
  it('wraps both layouts in the same bento HomeFeed uses', () => {
    // The desktop-video branch renders its own wrapper. Fixing only
    // renderPostContent leaves video posts bare, which is how this last
    // half-shipped in the other direction.
    expect(HOME_FEED).toContain(BENTO);
    const wrapper = `data-feed-item className="${BENTO}"`;
    expect(POST_PAGE.split(wrapper)).toHaveLength(3); // two occurrences

  });

  it('carries no hook that any theme can use to strip the wrapper', () => {
    // [data-post-shell] existed for exactly one purpose — being stripped. If it
    // comes back anywhere, so does the bare post page.
    expect(POST_PAGE).not.toContain('data-post-shell');
    expect(INDEX_CSS).not.toContain('data-post-shell');
  });

  it('does not un-paint a bento when replies expand inside it', () => {
    // CommentsWrapper expands replies INSIDE the bento on every breakpoint — it
    // is a drawer only on immersive surfaces. While [data-comments-section] was
    // in the nested-surfaces :has(), opening replies took the card's fill, blur
    // and ring away with them, here and on the home feed alike.
    const nested = INDEX_CSS.indexOf(':is([data-feed-item], [data-page-bento]):has(');
    expect(nested).toBeGreaterThan(-1);
    const selector = INDEX_CSS.slice(nested, INDEX_CSS.indexOf('{', nested));
    expect(selector).not.toContain('data-comments-section');
  });

  it('keeps the post drawer out of every theme that styles vaul sheets', () => {
    // [data-post-drawer] and [data-vaul-drawer] are the same node. index.css
    // declares it transparent at (0,2,1); an unqualified theme rule is an exact
    // tie and wins on import order, painting a full-viewport slab behind the
    // column on mobile. Any theme that styles vaul sheets must exclude it. This
    // is the slab the [data-post-shell] strip was aimed at and never touched.
    for (const [name, css] of [
      ['osaka', OSAKA_CSS],
      ['jungle', JUNGLE_CSS],
    ] as const) {
      const unqualified = new RegExp(
        `html\\[data-theme='${name}'\\] \\[data-vaul-drawer\\]\\s*\\{`
      );
      expect(css).not.toMatch(unqualified);
      expect(css).toContain(`[data-vaul-drawer]:not([data-post-drawer])`);
    }
  });
});
