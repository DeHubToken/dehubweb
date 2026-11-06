/**
 * Post video edits: mirror, quarter turns, and the photo studio's look +
 * adjust dials. The browser only previews them; the server bakes them into
 * the video (user_mint `videoEdits`), so every player shows the edited clip.
 */
import { DEFAULT_ADJUST, studioColorMatrix, type StudioAdjust } from './studioColor';
import { cropPayload, type CropRatioId, type VideoCropRect } from './video-crop';

export interface PostVideoEdits {
  mirror?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  look?: string;
  /** Look strength, 0..100. */
  strength?: number;
  adjust?: StudioAdjust;
  /** The part of the turned, mirrored frame to keep. */
  crop?: VideoCropRect;
  /** The shape picked for the crop box (Original, Free, 1:1...). */
  cropRatio?: CropRatioId;
}

export interface VideoEditsPayload {
  mirror?: boolean;
  rotate?: 90 | 180 | 270;
  matrix?: number[];
  vignette?: number;
  crop?: VideoCropRect;
}

/** The colour matrix the edits paint with, or null for none. */
export function videoEditsMatrix(e?: PostVideoEdits | null): number[] | null {
  if (!e) return null;
  return studioColorMatrix(e.look, e.strength ?? 100, e.adjust ?? DEFAULT_ADJUST);
}

/** What user_mint takes, or null when nothing changes the picture. */
export function videoEditsPayload(e?: PostVideoEdits | null): VideoEditsPayload | null {
  if (!e) return null;
  const out: VideoEditsPayload = {};
  if (e.mirror) out.mirror = true;
  if (e.rotate) out.rotate = e.rotate;
  const matrix = videoEditsMatrix(e);
  if (matrix) out.matrix = matrix.map((v) => Math.round(v * 10000) / 10000);
  const vignette = e.adjust?.vignette ?? 0;
  if (vignette > 0) out.vignette = vignette;
  const crop = cropPayload(e.crop);
  if (crop) out.crop = crop;
  return Object.keys(out).length ? out : null;
}

export function hasVideoEdits(e?: PostVideoEdits | null): boolean {
  return videoEditsPayload(e) != null;
}

/** feColorMatrix `values` for a 4x5 matrix. */
export function svgMatrixValues(m: number[]): string {
  return m.map((v) => Math.round(v * 10000) / 10000).join(' ');
}

/** The vignette as a CSS overlay, matching the photo studio's painter. */
export function vignetteBackground(v: number): string | undefined {
  if (!v) return undefined;
  const a = Math.min(1, v / 100) * 0.7;
  return `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${a}) 100%)`;
}

/** Self-destructing posts: how long the post stays up. Same list as the backend. */
export const POST_DESTRUCT_CHOICES = [3600, 43200, 86400, 604800, 2592000] as const;
export type PostDestructChoice = (typeof POST_DESTRUCT_CHOICES)[number];

export function postDestructLabel(s: number): string {
  switch (s) {
    case 3600: return '1 hour';
    case 43200: return '12 hours';
    case 86400: return '1 day';
    case 604800: return '7 days';
    case 2592000: return '30 days';
    default: return `${Math.round(s / 3600)} hours`;
  }
}

/**
 * Paints `source` (a video frame) with the edits onto a new canvas: turn,
 * mirror, crop, colour and vignette, so the cover matches the baked video.
 */
export function paintEditedFrame(source: CanvasImageSource, w: number, h: number, e?: PostVideoEdits | null): HTMLCanvasElement {
  const rot = e?.rotate ?? 0;
  const side = rot === 90 || rot === 270;
  const c = document.createElement('canvas');
  c.width = side ? h : w;
  c.height = side ? w : h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  if (e?.mirror) ctx.scale(-1, 1);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  ctx.restore();
  const crop = cropPayload(e?.crop);
  if (crop) {
    const cw = Math.max(2, Math.round(c.width * crop.w));
    const ch = Math.max(2, Math.round(c.height * crop.h));
    const cut = document.createElement('canvas');
    cut.width = cw;
    cut.height = ch;
    cut.getContext('2d')?.drawImage(c, Math.round(c.width * crop.x), Math.round(c.height * crop.y), cw, ch, 0, 0, cw, ch);
    return paintColour(cut, e);
  }
  return paintColour(c, e);
}

/** Colour matrix and vignette, painted in place. */
function paintColour(c: HTMLCanvasElement, e?: PostVideoEdits | null): HTMLCanvasElement {
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const m = videoEditsMatrix(e);
  if (m) {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      d[i] = 255 * (m[0] * r + m[1] * g + m[2] * b + m[4]);
      d[i + 1] = 255 * (m[5] * r + m[6] * g + m[7] * b + m[9]);
      d[i + 2] = 255 * (m[10] * r + m[11] * g + m[12] * b + m[14]);
    }
    ctx.putImageData(img, 0, 0);
  }
  const v = e?.adjust?.vignette ?? 0;
  if (v > 0) {
    const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(1, v / 100) * 0.7})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}
