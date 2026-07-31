/**
 * Osaka theme — selector-shape guard
 * ==================================
 *
 * The Osaka theme reaches most of the app through Tailwind class matching
 * rather than through data-* hooks, because ~11,000 themed utilities ship
 * across the app and only a fraction of the surfaces carrying them are tagged.
 * That works, but it has exactly one failure mode, and it shipped once:
 *
 *   [class*='bg-zinc-8']  ALSO matches  hover:bg-zinc-800/50
 *
 * A substring match cannot tell a resting fill from a hover variant, so the
 * theme painted every hover-only list row at rest. On the sidebar that read as
 * a grey block behind every name in the leaderboard, the follow list and the
 * chat roster; 1,525 `hover:` colour utilities ship app-wide, so the same
 * mistake in the colour lock froze every hover state in the product.
 *
 * The fix is a selector shape, and this test is what keeps it:
 *
 *   MATCH A RESTING TOKEN AS   :is([class^='NAME'], [class*=' NAME'])
 *
 * A class attribute is space-separated, so a resting token is either first in
 * the list or preceded by exactly one space; a variant token is always
 * preceded by its `hover:` / `focus:` / `group-hover:` / `lg:` prefix. Those
 * two attribute selectors separate them exactly, and — unlike a
 * `:not([class*=':bg-…'])` guard — they stay correct for the 56 elements that
 * carry a resting fill AND a hover variant in the same colour family.
 *
 * Variant matching is still allowed and still wanted; it is how the hover layer
 * re-attaches feedback the colour lock would otherwise swallow. It is only the
 * BARE substring that is banned.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW = readFileSync(resolve(__dirname, '../styles/osaka-theme.css'), 'utf8');
/* Comments quote the very selectors this file bans, so they are blanked out
   (newlines kept, so reported line numbers still point at the real source). */
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

/** Utility families whose resting/variant distinction is load-bearing. */
const GUARDED = /^(bg|text|border|from|via|to|rounded)-/;

/**
 * Strip `:not(...)` and `:where(...)` bodies. Inside an exclusion, a broader
 * substring match is safe by construction — over-excluding leaves the element
 * to a more specific rule, it never paints something that should be blank.
 */
function stripExclusions(css: string): string {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    const rest = css.slice(i);
    const m = /^:(not|where)\(/.exec(rest);
    if (!m) {
      out += css[i];
      continue;
    }
    let depth = 0;
    let j = i + m[0].length - 1;
    for (; j < css.length; j++) {
      if (css[j] === '(') depth++;
      else if (css[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    i = j;
  }
  return out;
}

/** Every `[class*='…']` sitting in a MATCH position, with its line number. */
function bareSubstringMatchers(): { token: string; line: number }[] {
  const matchPositionOnly = stripExclusions(CSS);
  const found: { token: string; line: number }[] = [];
  const re = /\[class\*='([^']*)'\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(matchPositionOnly)) !== null) {
    const token = m[1];
    // A leading space is the resting-token form — that is the whole point.
    if (token.startsWith(' ')) continue;
    // A token containing ':' is an explicit variant match (hover:, lg:, …).
    if (token.includes(':')) continue;
    if (!GUARDED.test(token)) continue;
    found.push({ token, line: matchPositionOnly.slice(0, m.index).split('\n').length });
  }
  return found;
}

describe('osaka-theme.css selector shapes', () => {
  it('never matches a themed utility with a bare substring selector', () => {
    // A bare [class*='bg-zinc-8'] also matches hover:bg-zinc-800, which paints
    // a hover-only row at rest — the "blocks on the lists of names" bug.
    const offenders = bareSubstringMatchers();
    expect(
      offenders.map((o) => `[class*='${o.token}'] at osaka-theme.css:${o.line}`),
    ).toEqual([]);
  });

  it('pairs every resting-token match with its ^= half', () => {
    // :is([class^='X'], [class*=' X']) — one half without the other silently
    // misses either the first class in the list or every other one.
    const prefixed = new Set([...CSS.matchAll(/\[class\^='([^']*)'\]/g)].map((m) => m[1]));
    const spaced = new Set(
      [...CSS.matchAll(/\[class\*=' ([^']*)'\]/g)].map((m) => m[1]),
    );
    const onlyPrefix = [...prefixed].filter((t) => !spaced.has(t));
    const onlySpaced = [...spaced].filter((t) => !prefixed.has(t));
    expect({ onlyPrefix, onlySpaced }).toEqual({ onlyPrefix: [], onlySpaced: [] });
  });

  it('keeps the state layer last, where it can outrank the colour lock', () => {
    // Sections 12 and 13 lock colour at every moment, hover included. The hover
    // rules tie them on specificity, so source order is what decides — put the
    // hover layer anywhere but last and every hover in the app stops working.
    // Section banners live in comments, so this one reads RAW.
    const hoverLayer = RAW.indexOf('16. THE STATE LAYER');
    expect(hoverLayer).toBeGreaterThan(-1);
    for (const earlier of ['12. PALETTE LOCK', '13. TEXT COLOUR', '15. DOCS + BLOG']) {
      expect(RAW.indexOf(earlier)).toBeLessThan(hoverLayer);
    }
  });

  it('never lets the untagged-page net reach inside a tagged glass surface', () => {
    // Nesting a backdrop-filter inside an already-frosted panel composites as a
    // flat opaque rectangle — the "it's all boxy" half of the same report.
    const net = RAW.slice(
      RAW.indexOf('11. UNTAGGED PAGES'),
      RAW.indexOf('12. PALETTE LOCK'),
    );
    const netRule = net.slice(net.indexOf("html[data-theme='osaka'] #app-root"));
    const firstBlockEnd = netRule.indexOf('}');
    const firstRule = netRule.slice(0, firstBlockEnd);
    expect(firstRule).toContain('backdrop-filter');
    for (const surface of [
      '[data-side-panel] *',
      '[data-feed-item] *',
      '[data-page-bento] *',
      '[data-search-bento] *',
    ]) {
      expect(firstRule).toContain(surface);
    }
  });
});
