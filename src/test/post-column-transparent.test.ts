import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const POST_PAGE = readFileSync(resolve(__dirname, '../pages/app/SinglePostPage.tsx'), 'utf8');
const INDEX_CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const OSAKA_CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
const JUNGLE_CSS = readFileSync(resolve(__dirname, '../styles/jungle-theme.css'), 'utf8');

/**
 * The dedicated post page's middle column has now been reported opaque three
 * times, and each fix aimed at a different element than the one painting. These
 * lock down the two that actually were.
 */
describe('dedicated post page — the middle column stays clear', () => {
  it('tags both column wrappers, not just the one the standard layout uses', () => {
    // The desktop-video branch renders its own wrapper. A fix applied to only
    // renderPostContent leaves video posts painted, which is how this last
    // half-shipped.
    const tagged = POST_PAGE.match(/data-feed-item data-post-shell/g) ?? [];
    expect(tagged).toHaveLength(2);
  });

  it('strips the column material from an explicit hook, not from its contents', () => {
    expect(INDEX_CSS).toContain('[data-feed-item][data-post-shell]:not([data-keep-dark])');
  });

  it('does not gate the strip on what the column happens to contain', () => {
    // `:has(:is([data-page-bento], [data-comments-section]))` never matched
    // here: the column holds a Video/Image/PostCard carrying neither hook, and
    // the comments section is only in the DOM while its drawer is open. The
    // arm still exists for the genuine nested-bento case, so assert the shell
    // is matched independently of it rather than that the :has() is gone.
    const shellArm = INDEX_CSS.indexOf('[data-feed-item][data-post-shell]');
    const hasArm = INDEX_CSS.indexOf(':is([data-feed-item], [data-page-bento]):has(');
    expect(shellArm).toBeGreaterThan(-1);
    expect(shellArm).toBeLessThan(hasArm);
  });

  it('keeps the post drawer out of every theme that styles vaul sheets', () => {
    // [data-post-drawer] and [data-vaul-drawer] are the same node. index.css
    // declares it transparent at (0,2,1); an unqualified theme rule is an exact
    // tie and wins on import order, painting a full-viewport slab behind the
    // column on mobile. Any theme that styles vaul sheets must exclude it.
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

  it('keeps the stripped column legible on mobile', () => {
    // The halo must not be scoped under #app-root: on mobile the page renders
    // inside a drawer portalled to <body>. It must also not exclude
    // [data-glass-page] *, because the page root carries that hook — copying
    // the neighbouring block's exclusion list verbatim makes this a no-op.
    const haloStart = INDEX_CSS.lastIndexOf('[data-post-shell]');
    const block = INDEX_CSS.slice(haloStart, INDEX_CSS.indexOf('}', haloStart));
    expect(block).toContain('text-zinc-6');
    expect(block).not.toContain('[data-glass-page] *');
    expect(INDEX_CSS).not.toContain('#app-root main [data-post-shell]');
  });
});
