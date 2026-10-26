/**
 * Drawing kit for the canvas overlay painter: rounded panels in the overlay's
 * glass, the three lucide icons the counters use, and caches for everything
 * that is raster — avatars, the DHB coin and emoji.
 *
 * Images are loaded with `crossOrigin = 'anonymous'` so they never taint the
 * canvas: the canvas is captured into the outgoing stream, and one tainted
 * draw would make the capture throw (or go black) for the rest of the
 * broadcast. An image whose server does not send CORS headers simply fails to
 * load and is never drawn; a placeholder takes its place.
 */
import coinUrl from '@/assets/dehub-coin.png';
import { buildAvatarUrl } from '@/lib/media-url';

type Ctx = CanvasRenderingContext2D;
export type Raster = HTMLCanvasElement | OffscreenCanvas;
type RasterCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// ─── Colours (live-overlay.css) ──────────────────────────────────────────────

/** The overlay's glass: `rgb(10 10 12 / 0.72)`. Canvas has no backdrop blur, so it is the tint alone. */
export const GLASS = 'rgba(10,10,12,0.72)';
export const GLASS_EDGE = 'rgba(255,255,255,0.16)';
export const WHITE = '#ffffff';
export const white = (alpha: number) => WHITE_ALPHA[Math.round(alpha * 100)] ?? `rgba(255,255,255,${alpha})`;
const WHITE_ALPHA: string[] = Array.from({ length: 101 }, (_, i) => `rgba(255,255,255,${i / 100})`);

const HEX = /^#[0-9a-f]{6}$/i;
/** A creator's accent colour, or the fallback. Only a plain hex is ever used, as in the DOM widgets. */
export function accentOf(settings: Record<string, unknown> | undefined, fallback = '#ffffff'): string {
  const c = settings?.accent;
  return typeof c === 'string' && HEX.test(c) ? c : fallback;
}

/** `#rrggbb` mixed toward white by `amount` (0..1), for `color-mix(in srgb, x 60%, white)`. */
export function mixWithWhite(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** `#rrggbb` at an alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

/**
 * A rounded rectangle path, radii clamped to half the shorter side like CSS.
 * Written out rather than `ctx.roundRect` so older Safari still draws it.
 */
export function roundRectPath(
  ctx: RasterCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  rBottom: number = r,
): void {
  const max = Math.max(0, Math.min(w, h) / 2);
  const t = Math.min(Math.max(0, r), max);
  const b = Math.min(Math.max(0, rBottom), max);
  ctx.beginPath();
  ctx.moveTo(x + t, y);
  ctx.lineTo(x + w - t, y);
  if (t) ctx.arcTo(x + w, y, x + w, y + t, t);
  ctx.lineTo(x + w, y + h - b);
  if (b) ctx.arcTo(x + w, y + h, x + w - b, y + h, b);
  ctx.lineTo(x + b, y + h);
  if (b) ctx.arcTo(x, y + h, x, y + h - b, b);
  ctx.lineTo(x, y + t);
  if (t) ctx.arcTo(x, y, x + t, y, t);
  ctx.closePath();
}

/** The glass panel every boxed widget sits on: tint, then a hairline edge inside it. */
export function glassPanel(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, hair: number, fill = GLASS): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  roundRectPath(ctx, x + hair / 2, y + hair / 2, w - hair, h - hair, Math.max(0, r - hair / 2));
  ctx.lineWidth = hair;
  ctx.strokeStyle = GLASS_EDGE;
  ctx.stroke();
}

/** A drop shadow for the next fill, or none. Offsets and blur in canvas pixels. */
export function shadow(ctx: Ctx, color: string, blur: number, offsetY = 0): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = offsetY;
}

export function noShadow(ctx: Ctx): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

// ─── Icons (lucide, 24-unit viewBox, 2-unit stroke) ──────────────────────────

export type IconName = 'eye' | 'clock' | 'heart';

const ICON_PATHS: Record<IconName, string> = {
  eye: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  clock: 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0M12 6v6l4 2',
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
};
const iconCache = new Map<IconName, Path2D | null>();

function iconPath(name: IconName): Path2D | null {
  if (!iconCache.has(name)) iconCache.set(name, typeof Path2D === 'undefined' ? null : new Path2D(ICON_PATHS[name]));
  return iconCache.get(name) ?? null;
}

/** A lucide icon `size` pixels square with its top-left at (x, y). */
export function drawIcon(ctx: Ctx, name: IconName, x: number, y: number, size: number, color: string): void {
  const path = iconPath(name);
  if (!path) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.restore();
}

// ─── Raster caches ───────────────────────────────────────────────────────────

/** A scratch canvas, off the document when the browser has OffscreenCanvas. Null where there is neither. */
export function makeCanvas(w: number, h: number): { canvas: Raster; ctx: RasterCtx } | null {
  const width = Math.max(1, Math.ceil(w));
  const height = Math.max(1, Math.ceil(h));
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) return { canvas, ctx };
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) return { canvas, ctx };
    }
  } catch {
    /* no canvas here: callers fall back to drawing directly */
  }
  return null;
}

interface Loaded {
  state: 'loading' | 'ready' | 'failed';
  image: HTMLImageElement | null;
  /** The image pre-cut to a circle, for avatars. */
  round: Raster | null;
}

/** Avatars are fetched at this many device pixels: sharp at 1080p, small to download. */
const AVATAR_PX = 128;
const MAX_IMAGES = 300;

/**
 * Images by URL. `get` never blocks a frame: the first call starts the load and
 * returns null, later calls return the image once it is decoded. A failure is
 * remembered and never retried — a dead avatar URL is not worth a request
 * every frame.
 */
export class ImageStore {
  private images = new Map<string, Loaded>();
  private disposed = false;

  get(url: string | undefined | null): HTMLImageElement | null {
    const entry = url ? this.entry(url) : null;
    return entry?.state === 'ready' ? entry.image : null;
  }

  /** A circular cut of the image, or the image itself where no scratch canvas exists. */
  round(url: string | undefined | null): CanvasImageSource | null {
    const entry = url ? this.entry(url) : null;
    if (entry?.state !== 'ready' || !entry.image) return null;
    if (!entry.round) {
      const scratch = makeCanvas(AVATAR_PX, AVATAR_PX);
      if (!scratch) return entry.image;
      const { ctx } = scratch;
      ctx.beginPath();
      ctx.arc(AVATAR_PX / 2, AVATAR_PX / 2, AVATAR_PX / 2, 0, Math.PI * 2);
      ctx.clip();
      // object-fit: cover
      const img = entry.image;
      const scale = Math.max(AVATAR_PX / img.naturalWidth, AVATAR_PX / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (AVATAR_PX - w) / 2, (AVATAR_PX - h) / 2, w, h);
      entry.round = scratch.canvas;
    }
    return entry.round;
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.images.values()) {
      if (entry.image) {
        entry.image.onload = null;
        entry.image.onerror = null;
      }
    }
    this.images.clear();
  }

  private entry(url: string): Loaded | null {
    if (this.disposed) return null;
    const known = this.images.get(url);
    if (known) return known;
    if (typeof Image === 'undefined') return null;
    if (this.images.size >= MAX_IMAGES) {
      // Oldest first: Map keeps insertion order.
      const oldest = this.images.keys().next().value as string;
      this.images.delete(oldest);
    }
    const image = new Image();
    const entry: Loaded = { state: 'loading', image, round: null };
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      entry.state = image.naturalWidth > 0 ? 'ready' : 'failed';
    };
    image.onerror = () => {
      entry.state = 'failed';
      entry.image = null;
    };
    image.src = url;
    this.images.set(url, entry);
    return entry;
  }
}

export interface AvatarUser {
  address?: string;
  avatarImageUrl?: string;
}

const avatarUrls = new Map<string, string | null>();

/** The CDN URL for a user's avatar, memoised: buildAvatarUrl parses and rebuilds a URL each call. */
export function avatarUrlOf(user: AvatarUser | undefined): string | null {
  if (!user?.address || !user.avatarImageUrl) return null;
  const key = `${user.address}\u0000${user.avatarImageUrl}`;
  let url = avatarUrls.get(key);
  if (url === undefined) {
    if (avatarUrls.size > 2000) avatarUrls.clear();
    url = buildAvatarUrl(user.address, user.avatarImageUrl, AVATAR_PX) ?? null;
    avatarUrls.set(key, url);
  }
  return url;
}

/** `[data-ow-avatar]`: the picture in a circle, or the empty disc it sits on while there is none. */
export function drawAvatar(ctx: Ctx, images: ImageStore, user: AvatarUser | undefined, x: number, y: number, size: number): void {
  const img = images.round(avatarUrlOf(user));
  if (img) {
    ctx.drawImage(img, x, y, size, size);
    return;
  }
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = white(0.12);
  ctx.fill();
}

export const COIN_URL: string = coinUrl;

/**
 * The DHB coin after an amount (`<DhbCoin />`: 1.15em square, which with its
 * -0.2em vertical-align centres it on the text's middle). `midY` is the line's
 * middle, where the painter's `textBaseline = 'middle'` text sits. Drawn as a
 * gold disc until the PNG has loaded.
 */
export function drawCoin(ctx: Ctx, images: ImageStore, x: number, midY: number, fontPx: number): void {
  const size = fontPx * 1.15;
  const img = images.get(COIN_URL);
  if (img) {
    ctx.drawImage(img, x, midY - size / 2, size, size);
    return;
  }
  ctx.beginPath();
  ctx.arc(x + size / 2, midY, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#facc15';
  ctx.fill();
}

/** Width a coin takes after text, including the space before it. */
export const coinWidth = (fontPx: number, space: number) => space + fontPx * 1.15;

/**
 * Emoji, rasterised once per glyph and size bucket. A colour emoji is the
 * slowest thing fillText can draw; a gift celebration throws eighty of them
 * around at once, so each is drawn from a small bitmap instead.
 */
const BUCKETS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384];

export class EmojiSprites {
  private sprites = new Map<string, Raster | null>();
  private fontFamily: string;

  constructor(fontFamily: string) {
    this.fontFamily = fontFamily;
  }

  /** Draw `glyph` about `px` tall, centred on (cx, cy). */
  draw(ctx: Ctx, glyph: string, cx: number, cy: number, px: number): void {
    if (px < 1) return;
    const bucket = BUCKETS.find((b) => b >= px) ?? BUCKETS[BUCKETS.length - 1];
    const key = `${bucket}\u0000${glyph}`;
    let sprite = this.sprites.get(key);
    if (sprite === undefined) {
      sprite = this.render(glyph, bucket);
      if (this.sprites.size > 400) this.sprites.clear();
      this.sprites.set(key, sprite);
    }
    if (!sprite) {
      // No scratch canvas: draw the glyph itself.
      ctx.font = `${Math.round(px)}px ${this.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, cx, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      return;
    }
    const side = (sprite.width / bucket) * px;
    ctx.drawImage(sprite, cx - side / 2, cy - side / 2, side, side);
  }

  clear(): void {
    this.sprites.clear();
  }

  private render(glyph: string, px: number): Raster | null {
    // Room around the glyph: emoji overhang their em box.
    const side = Math.ceil(px * 1.4);
    const scratch = makeCanvas(side, side);
    if (!scratch) return null;
    const { ctx } = scratch;
    ctx.font = `${px}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(glyph, side / 2, side / 2);
    return scratch.canvas;
  }
}
