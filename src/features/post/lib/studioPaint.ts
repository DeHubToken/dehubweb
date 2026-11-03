/**
 * The photo studio's painter for the web: crop, rotate and straighten, the
 * look and adjust dials, a vignette, then marks on top — all drawn from the
 * ORIGINAL picture. The same function paints the preview canvas and the file
 * that posts.
 */
import { DEFAULT_ADJUST, studioColorMatrix, type StudioAdjust } from './studioColor';

export type CropRatioId = 'original' | 'free' | '1:1' | '4:5' | '9:16' | '16:9';

export interface StudioPoint { x: number; y: number }

export interface StudioStroke {
  kind: 'stroke';
  points: StudioPoint[];
  color: string;
  /** Line width as a fraction of the picture's shorter side. */
  width: number;
}

export type StudioFont = 'clean' | 'bold' | 'serif' | 'mono';

export interface StudioText {
  kind: 'text';
  /** Left edge, vertical middle, 0..1 of the picture. */
  at: StudioPoint;
  text: string;
  color: string;
  /** Font size as a fraction of the picture's shorter side. */
  size: number;
  font?: StudioFont;
  /** Drawn on a pill in `color`, text in black or white on top. */
  bg?: boolean;
}

export type StudioMark = StudioStroke | StudioText;

export interface StudioCrop {
  /** Quarter turns clockwise, 0..3. */
  quarter: number;
  flipX: boolean;
  /** Fine rotation in degrees, -45..45. */
  straighten: number;
  ratio: CropRatioId;
  /** The kept part, 0..1 of the turned picture. */
  rect: { x: number; y: number; w: number; h: number };
}

export interface StudioEdits {
  crop: StudioCrop;
  lookId: string;
  /** 0..100 */
  strength: number;
  adjust: StudioAdjust;
  items: StudioMark[];
}

export const RATIOS: { id: CropRatioId; label: string; value: number | null }[] = [
  { id: 'original', label: 'Original', value: null },
  { id: 'free', label: 'Free', value: null },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:5', label: '4:5', value: 4 / 5 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
];

export function defaultEdits(): StudioEdits {
  return {
    crop: { quarter: 0, flipX: false, straighten: 0, ratio: 'original', rect: { x: 0, y: 0, w: 1, h: 1 } },
    lookId: 'normal',
    strength: 100,
    adjust: { ...DEFAULT_ADJUST },
    items: [],
  };
}

export function cloneEdits(e: StudioEdits): StudioEdits {
  return {
    crop: { ...e.crop, rect: { ...e.crop.rect } },
    lookId: e.lookId,
    strength: e.strength,
    adjust: { ...e.adjust },
    items: e.items.map((it) => (it.kind === 'stroke' ? { ...it, points: [...it.points] } : { ...it, at: { ...it.at } })),
  };
}

export function hasStudioEdits(e?: StudioEdits | null): boolean {
  if (!e) return false;
  const c = e.crop;
  const cropped = c.quarter !== 0 || c.flipX || c.straighten !== 0 || c.rect.x > 0.001 || c.rect.y > 0.001 || c.rect.w < 0.999 || c.rect.h < 0.999;
  return cropped || e.lookId !== 'normal' || Object.values(e.adjust).some((v) => v !== 0) || e.items.length > 0;
}

export function turnedSize(w: number, h: number, quarter: number) {
  return quarter % 2 === 0 ? { w, h } : { w: h, h: w };
}

/** Zoom needed so a picture turned by `deg` still covers its own frame. */
export function straightenCover(w: number, h: number, deg: number) {
  const r = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/** Pixel size of the edited picture. */
export function outputSize(W: number, H: number, crop: StudioCrop) {
  const t = turnedSize(W, H, crop.quarter);
  return { w: Math.max(1, Math.round(t.w * crop.rect.w)), h: Math.max(1, Math.round(t.h * crop.rect.h)) };
}

type Source = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

function sizeOf(src: Source) {
  if ('naturalWidth' in src) return { W: src.naturalWidth, H: src.naturalHeight };
  return { W: src.width, H: src.height };
}

function paintPicture(ctx: CanvasRenderingContext2D, src: Source, w: number, h: number, crop: StudioCrop, rect: StudioCrop['rect']) {
  const { W, H } = sizeOf(src);
  const t = turnedSize(W, H, crop.quarter);
  const cover = straightenCover(t.w, t.h, crop.straighten);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.scale(w / (rect.w * t.w), h / (rect.h * t.h));
  ctx.translate(-rect.x * t.w, -rect.y * t.h);
  ctx.translate(t.w / 2, t.h / 2);
  ctx.rotate(((crop.quarter * 90 + crop.straighten) * Math.PI) / 180);
  ctx.scale((crop.flipX ? -1 : 1) * cover, cover);
  ctx.translate(-W / 2, -H / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, W, H);
  ctx.restore();
}

/** Runs the colour matrix over the canvas pixels (works in every browser, unlike ctx.filter). */
function applyMatrix(ctx: CanvasRenderingContext2D, w: number, h: number, m: number[]) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const o0 = m[4] * 255, o1 = m[9] * 255, o2 = m[14] * 255;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = m[0] * r + m[1] * g + m[2] * b + o0;
    d[i + 1] = m[5] * r + m[6] * g + m[7] * b + o1;
    d[i + 2] = m[10] * r + m[11] * g + m[12] * b + o2;
  }
  ctx.putImageData(img, 0, 0);
}

function paintVignette(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount <= 0) return;
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${(0.65 * amount) / 100})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const FONT_CSS: Record<StudioFont, string> = {
  clean: '600 {px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  bold: 'italic 900 {px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: '700 {px}px Georgia, "Times New Roman", serif',
  mono: '600 {px}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

export function studioFontCss(font: StudioFont | undefined, px: number) {
  return FONT_CSS[font ?? 'clean'].replace('{px}', String(Math.round(px)));
}

/** Black or white, whichever reads on `color`. */
export function inkOn(color: string) {
  const m = /^#([\da-f]{6})$/i.exec(color);
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#000000' : '#ffffff';
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** A text mark's box in pixels of a `w` x `h` picture, for tapping and dragging it. */
export function textBox(item: StudioText, w: number, h: number) {
  const size = Math.max(8, item.size * Math.min(w, h));
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  let tw = item.text.length * size * 0.55;
  if (measureCtx) {
    measureCtx.font = studioFontCss(item.font, size);
    tw = measureCtx.measureText(item.text).width;
  }
  const pad = item.bg ? size * 0.35 : size * 0.15;
  return { x: item.at.x * w - pad, y: item.at.y * h - size * 0.7, w: tw + pad * 2, h: size * 1.4, size, textWidth: tw };
}

export function paintMarks(ctx: CanvasRenderingContext2D, items: StudioMark[], w: number, h: number) {
  const unit = Math.min(w, h);
  for (const item of items) {
    if (item.kind === 'stroke') {
      if (!item.points.length) continue;
      const width = Math.max(1, item.width * unit);
      ctx.fillStyle = item.color;
      ctx.strokeStyle = item.color;
      if (item.points.length === 1) {
        const p = item.points[0];
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(item.points[0].x * w, item.points[0].y * h);
      for (let i = 1; i < item.points.length; i++) ctx.lineTo(item.points[i].x * w, item.points[i].y * h);
      ctx.stroke();
    } else {
      const size = Math.max(8, item.size * unit);
      ctx.font = studioFontCss(item.font, size);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'start';
      const x = item.at.x * w;
      const y = item.at.y * h;
      if (item.bg) {
        const b = textBox(item, w, h);
        ctx.fillStyle = item.color;
        ctx.beginPath();
        const r = b.h * 0.3;
        ctx.moveTo(b.x + r, b.y);
        ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
        ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
        ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
        ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
        ctx.closePath();
        ctx.fill();
        ctx.font = studioFontCss(item.font, size);
        ctx.fillStyle = inkOn(item.color);
        ctx.fillText(item.text, x, y);
        continue;
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, size * 0.12);
      ctx.strokeStyle = item.color === '#000000' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';
      ctx.strokeText(item.text, x, y);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x, y);
    }
  }
}

/** The finished picture into a `w` x `h` canvas: crop, colour, vignette, marks. */
export function paintStudio(ctx: CanvasRenderingContext2D, src: Source, w: number, h: number, e: StudioEdits, opts?: { skipItems?: boolean; uncropped?: boolean }) {
  ctx.clearRect(0, 0, w, h);
  paintPicture(ctx, src, w, h, e.crop, opts?.uncropped ? { x: 0, y: 0, w: 1, h: 1 } : e.crop.rect);
  const m = studioColorMatrix(e.lookId, e.strength, e.adjust);
  if (m) applyMatrix(ctx, w, h, m);
  if (opts?.uncropped) return;
  paintVignette(ctx, w, h, e.adjust.vignette);
  if (!opts?.skipItems && e.items.length) paintMarks(ctx, e.items, w, h);
}

export function loadPicture(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image'));
    img.src = url;
  });
}

/** Very large photos are capped so phones do not run out of canvas memory. */
const MAX_SIDE = 4096;

/** Render the edits at full size from the original and return the file that posts. */
export async function bakeStudio(original: File, e: StudioEdits): Promise<File> {
  const url = URL.createObjectURL(original);
  try {
    const img = await loadPicture(url);
    const full = outputSize(img.naturalWidth, img.naturalHeight, e.crop);
    const k = Math.min(1, MAX_SIDE / Math.max(full.w, full.h));
    const w = Math.max(1, Math.round(full.w * k));
    const h = Math.max(1, Math.round(full.h * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no canvas');
    paintStudio(ctx, img, w, h, e);
    const type = original.type === 'image/png' || original.type === 'image/webp' ? original.type : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (!blob) throw new Error('encode failed');
    const base = original.name.replace(/\.[^.]+$/, '') || 'photo';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${base}-edit.${ext}`, { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
