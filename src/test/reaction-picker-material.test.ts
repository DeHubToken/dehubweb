import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { POST_REACTIONS } from '@/lib/reactions';

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

  it('marks the viewer\'s reaction by animating it, not with a ring or a bloom', () => {
    expect(PICKER).not.toMatch(/bg-white\/15 ring-1 ring-white\/40/);
    expect(PICKER).not.toContain('radial-gradient');
    expect(PICKER).not.toContain('drop-shadow');
    expect(PICKER).toContain('animate={isCurrent || hovered === reaction.key}');
    expect(PICKER).toContain('data-reaction-current');
    expect(CSS).not.toContain('[data-reaction-glow]');
    // Every reaction needs its moving file, or it falls back to the still one.
    for (const key of POST_REACTIONS) {
      expect(existsSync(resolve(__dirname, `../../public/emoji/animated/${key}.webp`))).toBe(true);
    }
    // The paper theme must not wash ink over the selected emoji.
    expect(CSS).not.toMatch(/\[data-reaction-option\]\[data-active="true"\] \{\s*background-color/);
  });

  it('prints each reaction total under its emoji, zero included', () => {
    expect(PICKER).toContain('const tally = counts ? (counts[reaction.key] ?? 0) : null;');
    expect(PICKER).toContain("data-zero={tally === 0 ? 'true' : undefined}");
    // A fixed-width, truncated line: ten four-character totals must not be
    // able to widen the tray past a phone screen.
    expect(PICKER).toMatch(/w-full truncate text-center text-\[10px\]/);
  });

  it('flips the totals to ink on the paper theme', () => {
    expect(CSS).toContain('html[data-theme="light"] [data-reaction-tray] [data-reaction-count]');
    expect(CSS).toContain('[data-reaction-count][data-zero="true"]');
  });
});
