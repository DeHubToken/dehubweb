import { describe, expect, it } from 'vitest';
import { cleanVideoOptions, fitVideoBox, keptDuration, nextQuarterTurn, videoTransform } from '@/lib/dm-video-options';

describe('dm video options', () => {
  it('sends nothing for an untouched video', () => {
    expect(cleanVideoOptions({}, 15)).toBeUndefined();
    expect(cleanVideoOptions({ trimStart: 0, trimEnd: 15 }, 15)).toBeUndefined();
  });
  it('keeps real choices', () => {
    expect(cleanVideoOptions({ trimStart: 3, trimEnd: 12, coverAt: 5, mirror: true, rotate: 90, hidden: 'reveal' }, 15))
      .toEqual({ trimStart: 3, trimEnd: 12, coverAt: 5, mirror: true, rotate: 90, hidden: 'reveal' });
  });
  it('turns a quarter at a time and wraps', () => {
    expect(nextQuarterTurn(undefined)).toBe(90);
    expect(nextQuarterTurn(270)).toBe(0);
  });
  it('rotates before flipping', () => {
    expect(videoTransform({ rotate: 90, mirror: true })).toBe('rotate(90deg) scaleX(-1)');
    expect(videoTransform({})).toBeUndefined();
  });
  it('measures the kept length', () => {
    expect(keptDuration({ trimStart: 3, trimEnd: 12 }, 15)).toBe(9);
    expect(keptDuration(undefined, 15)).toBe(15);
  });
  it('swaps the box for a sideways video', () => {
    const upright = fitVideoBox(704, 1252, {}, 240, 300);
    const turned = fitVideoBox(704, 1252, { rotate: 90 }, 240, 300);
    expect(upright.boxH).toBeGreaterThan(upright.boxW);
    expect(turned.boxW).toBeGreaterThan(turned.boxH);
    expect(turned.innerW).toBe(turned.boxH);
  });
});
