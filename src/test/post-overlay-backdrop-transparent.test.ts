import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const OSAKA = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
const JUNGLE = readFileSync(resolve(__dirname, '../styles/jungle-theme.css'), 'utf8');

/**
 * The dedicated post page rendered a full-height frosted panel down the middle
 * column on Osaka and Jungle, behind every bento.
 *
 * It was NOT any element the previous passes went after. It is
 * [data-post-overlay-backdrop] — `fixed top-0 bottom-0`, sized to the middle
 * column (AppLayout) — caught by each theme's #app-root untagged-slab net via
 * its `bg-black` class. index.css declares that element transparent, but the
 * net carries an id and wins regardless of !important.
 *
 * A test asserting the index.css declaration exists passes while the bug is
 * live, which is how this survived several attempts. The invariant that
 * actually decides the pixel is that the id-scoped nets EXCLUDE the post layer,
 * so that is what these assert.
 */
const POST_LAYER = ['[data-post-overlay]', '[data-post-overlay-backdrop]', '[data-post-drawer]'];

/** The fill net: everything from the `#app-root` scope to the opening brace. */
function fillNetSelector(css: string, theme: string): string {
  const marker = `html[data-theme='${theme}'] #app-root`;
  let from = -1;
  for (let i = css.indexOf(marker); i !== -1; i = css.indexOf(marker, i + 1)) {
    const head = css.slice(i, css.indexOf('{', i));
    if (head.includes('bg-black')) { from = i; break; }
  }
  if (from === -1) throw new Error(`no untagged-slab fill net found for ${theme}`);
  return css.slice(from, css.indexOf('{', from));
}

describe('post overlay backdrop is never repainted by the untagged-slab nets', () => {
  for (const [theme, css] of [
    ['osaka', OSAKA],
    ['jungle', JUNGLE],
  ] as const) {
    it(`${theme}: the fill net excludes every element in the post layer`, () => {
      const selector = fillNetSelector(css, theme);
      for (const hook of POST_LAYER) {
        // Present as an exclusion — inside :where(...) for osaka, :not(...) for
        // jungle — rather than merely mentioned somewhere in the file.
        expect(selector, `${theme} fill net must exclude ${hook}`).toContain(hook);
      }
    });

    it(`${theme}: the backdrop is excluded, not just re-declared transparent`, () => {
      // Re-declaring it elsewhere in the theme file would be the wrong fix: the
      // net also sets backdrop-filter, and an id-scoped net cannot be beaten by
      // a plain html[data-theme] rule anyway.
      expect(fillNetSelector(css, theme)).toContain('[data-post-overlay-backdrop]');
    });
  }
});
