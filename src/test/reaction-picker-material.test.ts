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
    expect(CSS).toContain('[data-reaction-option][data-active="true"]');
    expect(CSS).toMatch(/prefers-reduced-transparency:[^)]+\)[\s\S]*\[data-reaction-tray\]/);
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
