import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LAYOUT = readFileSync(resolve(__dirname, '../components/app/AppLayout.tsx'), 'utf8');
const INDEX_CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/**
 * [data-post-overlay-backdrop] is `fixed`, full height and sized to the middle
 * column. It shipped with Tailwind's `bg-black`, which every theme's
 * untagged-slab safety net matches on `[class*='bg-black']` — and those nets are
 * scoped under #app-root, so they carry an id and beat any plain re-declaration
 * regardless of !important. The result was a full-height frosted panel across
 * the dedicated post page on Osaka and Jungle, reported three times.
 *
 * The element now has no colour class at all and inherits <main>'s background,
 * which is correct in every theme and unreachable by any net. Re-adding a colour
 * utility here brings the whole bug back, so this fails loudly if anyone does.
 */
describe('post overlay backdrop carries no colour class', () => {
  /** The JSX element, from its data attribute to the end of the tag. */
  function backdropElement(): string {
    const at = LAYOUT.indexOf('data-post-overlay-backdrop');
    expect(at, 'data-post-overlay-backdrop must exist in AppLayout').toBeGreaterThan(-1);
    return LAYOUT.slice(at, LAYOUT.indexOf('/>', at));
  }

  it('has no background utility on the element', () => {
    const el = backdropElement();
    const className = /className="([^"]*)"/.exec(el)?.[1] ?? '';
    expect(className, 'backdrop className').not.toMatch(/\bbg-/);
    expect(className).toContain('fixed');
  });

  it('has no inline background either', () => {
    expect(backdropElement()).not.toMatch(/background/i);
  });

  it('takes its colour from <main> via inherit', () => {
    // Unscoped and theme-free on purpose: `inherit` resolves to <main>'s own
    // background in every theme — black on the opaque ones, paper on light,
    // transparent on every canvas theme — so no theme needs a rule for it, and
    // a tenth theme is correct the day it lands.
    expect(INDEX_CSS).toMatch(
      /\[data-post-overlay-backdrop\]\s*\{[^}]*background-color:\s*inherit/
    );
  });
});
