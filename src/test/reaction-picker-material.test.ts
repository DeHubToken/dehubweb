import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PICKER = readFileSync(
  resolve(__dirname, '../components/app/cards/ReactionPicker.tsx'),
  'utf8',
);
const CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('reaction picker material', () => {
  it('uses the app panel radius rather than a pill-shaped outer tray', () => {
    expect(PICKER).toContain("'rounded-2xl border border-white/15 bg-zinc-950/80'");
    // Tray, the nine reactions, and the author-only ⓘ that followed them.
    expect(PICKER.match(/data-keep-round/g)).toHaveLength(3);
    expect(PICKER).not.toMatch(/data-reaction-tray[\s\S]{0,500}rounded-full bg-zinc/);
  });

  it('matches the liquid-glass hover surface and respects reduced motion', () => {
    expect(PICKER).toContain('backdrop-blur-[28px] backdrop-saturate-150');
    expect(PICKER).toContain('useReducedMotion()');
    expect(CSS).toContain('rgba(9, 9, 11, 0.68)');
    expect(CSS).toContain('html[data-theme="light"] [data-reaction-tray]');
    expect(CSS).toContain('border-radius: 1rem !important');
    expect(CSS).toContain('[data-reaction-option]:hover');
    expect(CSS).toMatch(/prefers-reduced-transparency:[^)]+\)[\s\S]*\[data-reaction-tray\]/);
  });

  it('marks the viewer\'s reaction with a bloom in the emoji\'s colour, not a ring', () => {
    expect(PICKER).not.toMatch(/bg-white\/15 ring-1 ring-white\/40/);
    expect(PICKER).toContain('const REACTION_GLOW: Record<PostReaction, string>');
    expect(PICKER).toContain('backgroundImage: `radial-gradient(circle, rgb(${glow} / 0.30)');
    expect(PICKER).toContain('filter: `drop-shadow(0 0 5px rgb(${glow} / 0.85))`');
    // Space-separated channels only work in the `rgb(R G B / A)` form; the
    // legacy rgba() spelling would drop the declaration outright.
    expect(PICKER).not.toMatch(/rgba\(\$\{glow\}/);
    // Every reaction needs a colour, or its selected state paints nothing.
    expect(PICKER.match(/^ {2}\w+: +'\d+ \d+ \d+',/gm)).toHaveLength(9);
    // The paper theme must not wash ink over the bloom.
    expect(CSS).not.toMatch(/\[data-reaction-option\]\[data-active="true"\] \{\s*background-color/);
  });

  it('prints each reaction total in the corner, zero included', () => {
    expect(PICKER).toContain('const tally = counts ? (counts[reaction.key] ?? 0) : null;');
    expect(PICKER).toContain("data-zero={tally === 0 ? 'true' : undefined}");
    // Absolutely positioned: nine four-character totals must not be able to
    // widen the tray past a phone screen.
    expect(PICKER).toMatch(/absolute right-0\.5 top-0 text-\[9px\]/);
  });

  it('flips the totals to ink on the paper theme', () => {
    expect(CSS).toContain('html[data-theme="light"] [data-reaction-tray] [data-reaction-count]');
    expect(CSS).toContain('[data-reaction-count][data-zero="true"]');
  });
});
