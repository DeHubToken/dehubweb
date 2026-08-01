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
    expect(PICKER.match(/data-keep-round/g)).toHaveLength(2);
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
});
