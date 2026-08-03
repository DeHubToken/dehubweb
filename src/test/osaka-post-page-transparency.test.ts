import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const POST_PAGE = readFileSync(resolve(__dirname, '../pages/app/SinglePostPage.tsx'), 'utf8');
const THEME_CSS = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
const SHARED_CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('Osaka dedicated post transparency', () => {
  it('marks every dedicated post layout as a post surface', () => {
    expect(POST_PAGE.match(/data-post-page/g)).toHaveLength(3);
  });

  it('clears both direct-route and feed-overlay post surfaces', () => {
    expect(THEME_CSS).toContain("html[data-theme='osaka'] #app-root [data-post-page]");
    expect(SHARED_CSS).toMatch(/\[data-theme="osaka"\][^\n]*\[data-post-overlay\]/);
  });

  // This used to assert a per-theme `[data-post-overlay-backdrop]` transparent
  // rule, and it passed for the entire time that element was rendering as a
  // full-height frosted panel across the middle of the post page: the rule
  // existed and lost, out-specified by the #app-root safety net. Asserting the
  // losing rule is worse than asserting nothing. The backdrop now takes its
  // colour from <main> via `inherit` and carries no colour class at all, which
  // is what actually keeps it off every theme — so that is what is asserted.
  it('gives the post backing no colour of its own to be repainted', () => {
    expect(SHARED_CSS).toMatch(/\[data-post-overlay-backdrop\]\s*\{[^}]*background-color:\s*inherit/);
    expect(SHARED_CSS).not.toMatch(
      /\[data-theme="osaka"\][^\n]*\[data-post-overlay-backdrop\]/
    );
  });
});
