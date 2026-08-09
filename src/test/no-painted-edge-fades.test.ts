import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * The scroll-fade idiom: an element pinned to one edge of a scroller, a fixed
 * narrow width, painted with a gradient that runs to a named colour.
 *
 * A scrim over artwork is a different thing and stays allowed — those cover a
 * fraction of the element (`w-1/2`, `inset-0`) and darken a photo on purpose,
 * rather than guessing the colour of the surface behind a row of chips.
 */
const PAINTED_EDGE_FADE = /className="[^"]*absolute[^"]*(?:right-0|left-0)[^"]*\bw-\d+(?![\d/])[^"]*bg-gradient-to-[lr] from-[a-z]/;

describe('scroll edge fades', () => {
  it('are masked, never painted', () => {
    // A painted strip has to match the surface underneath it. These sat on the
    // zinc-900 feed nav, on wood in the jungle theme, on paper in light — every
    // one of them a visible block in the wrong colour. useScrollFadeMask (and
    // SwipeableCarousel's fadeEdges) dissolve the row itself instead, which has
    // no colour to get wrong.
    const offenders = sourceFiles(SRC)
      .filter((file) => PAINTED_EDGE_FADE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('no longer need per-theme recolouring', () => {
    // The theme picker's strip carried three separate overrides — minimal,
    // light and jungle each had to repaint it. A mask needs none.
    const css = [
      readFileSync(resolve(SRC, 'index.css'), 'utf8'),
      readFileSync(resolve(SRC, 'styles/jungle-theme.css'), 'utf8'),
    ].join('\n');

    expect(css).not.toContain('data-theme-picker-fade');
  });
});
