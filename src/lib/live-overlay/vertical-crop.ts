import type { CSSProperties } from 'react';

/**
 * Dual-format live: the 9:16 window a phone viewer sees of a landscape stream.
 *
 * Fractions of the source frame, like a widget rectangle. The creator drags it
 * in Live Studio; the vertical feed crops the one landscape picture to it on the
 * viewer's device, so there is no second encode. See dehub-stream-backend
 * models/LiveOverlay.ts.
 */
export interface VerticalCrop {
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Width of a full-height 9:16 window over a 16:9 frame: (9/16) / (16/9). */
const WIDTH_PER_HEIGHT = 81 / 256;
export const MIN_CROP_HEIGHT = 0.5;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A 9:16 window of the given height (fraction of the frame), centred on (cx, cy) and kept inside it. */
export function cropAt(height: number, cx: number, cy: number, enabled = true): VerticalCrop {
  const h = clamp(height, MIN_CROP_HEIGHT, 1);
  const w = h * WIDTH_PER_HEIGHT;
  return { enabled, w, h, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h) };
}

export const CENTRED_CROP: VerticalCrop = cropAt(1, 0.5, 0.5);

/** A stored crop, or null when there is none or it does not read. */
export function parseVerticalCrop(raw: unknown): VerticalCrop | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { enabled: r.enabled !== false, x, y, w, h };
}

/**
 * Style for a box holding the whole landscape picture, inside a 9:16 frame
 * with overflow hidden, so only the crop shows. The video inside it should be
 * `w-full h-full object-cover`: when the picture really is 16:9 that is an
 * exact fit, and when it is not the picture is never stretched.
 */
export function verticalCropStyle(crop: VerticalCrop): CSSProperties {
  return {
    position: 'absolute',
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
  };
}
