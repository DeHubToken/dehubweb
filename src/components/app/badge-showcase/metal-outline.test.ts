import { describe, expect, it } from 'vitest';
import { traceMetalOutline } from './metal-outline';
import { badgeAnimationStyle } from '@/lib/badge-animation-style';

describe('metal badge silhouette', () => {
  it('retains a thin raised claw and ignores detached alpha noise', () => {
    const size = 32, pixels = new Uint8ClampedArray(size * size * 4);
    const fill = (x: number, y: number) => { pixels[(y * size + x) * 4 + 3] = 255; };
    for (let y = 12; y < 27; y++) for (let x = 10; x < 24; x++) fill(x, y);
    for (let y = 3; y <= 16; y++) fill(10, y);
    fill(29, 1);
    const outline = traceMetalOutline(pixels, size);
    expect(Math.min(...outline.map(p => p[1]))).toBe(2);
    expect(Math.max(...outline.map(p => p[0]))).toBe(25);
    expect(Math.max(...outline.map(p => p[1]))).toBe(28);
  });
  it('rejects empty artwork so the showcase can fall back', () => {
    expect(() => traceMetalOutline(new Uint8ClampedArray(16 * 16 * 4), 16)).toThrow();
  });
  it('uses metal for System, Light and Minimal and preserves Osaka glitter', () => {
    expect(badgeAnimationStyle('light')).toBe('metallic');
    expect(badgeAnimationStyle('minimal')).toBe('metallic');
    expect(badgeAnimationStyle('osaka')).toBe('sticker');
    expect(badgeAnimationStyle('system')).toBe('metallic');
  });
});
