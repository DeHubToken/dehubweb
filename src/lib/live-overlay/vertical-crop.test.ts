import { describe, expect, it } from 'vitest';
import { CENTRED_CROP, cropAt, parseVerticalCrop, verticalCropStyle } from './vertical-crop';

describe('vertical crop', () => {
  it('centres a full-height 9:16 window over a 16:9 frame', () => {
    expect(CENTRED_CROP.h).toBe(1);
    // 9:16 in pixels over a 16:9 frame.
    expect((CENTRED_CROP.w * 16) / (CENTRED_CROP.h * 9)).toBeCloseTo(9 / 16);
    expect(CENTRED_CROP.x + CENTRED_CROP.w / 2).toBeCloseTo(0.5);
  });

  it('keeps the window inside the frame', () => {
    const c = cropAt(0.6, 0.99, 0.01);
    expect(c.x + c.w).toBeCloseTo(1);
    expect(c.y).toBe(0);
    expect(cropAt(0.1, 0.5, 0.5).h).toBe(0.5);
  });

  it('reads what the API stores and drops what it cannot', () => {
    expect(parseVerticalCrop({ x: 0.1, y: 0, w: 0.3, h: 1 })).toEqual({ enabled: true, x: 0.1, y: 0, w: 0.3, h: 1 });
    expect(parseVerticalCrop({ x: 'a', y: 0, w: 0.3, h: 1 })).toBeNull();
    expect(parseVerticalCrop(null)).toBeNull();
  });

  it('places the whole picture so only the window shows', () => {
    expect(verticalCropStyle({ enabled: true, x: 0.25, y: 0, w: 0.5, h: 1 })).toMatchObject({
      width: '200%',
      height: '100%',
      left: '-50%',
      top: '0%',
    });
  });
});
