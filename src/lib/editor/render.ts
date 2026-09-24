/**
 * Shared clip renderer.
 * =====================
 * The live preview, the video exporter and the still-image exporter all draw
 * through this one module. They used to carry their own copies of drawClip,
 * and the exporter's copy had drifted: text backgrounds and outlines showed in
 * the preview but were missing from every exported file.
 *
 * Geometry lives here too (`clipBox`), so the canvas selection handles, hit
 * testing and the pixels that get drawn can never disagree about where a clip
 * is.
 */
import type { Clip, ClipTransform, MediaClip, ShapeClip, TextClip } from "./types";
import { computeClipAnimation } from "./animationPresets";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderSources {
  videos: Map<string, HTMLVideoElement>;
  images: Map<string, HTMLImageElement>;
}

/** A clip's footprint in canvas pixels: centre, unrotated size, rotation (deg). */
export interface ClipBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

const DEFAULT_TRANSFORM: ClipTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
const TEXT_FADE = 0.3;

export function getTransform(clip: Clip): ClipTransform {
  const t = { ...DEFAULT_TRANSFORM, ...(clip.transform ?? {}) };
  if (clip.kind === "text") {
    t.x = clip.x;
    t.y = clip.y;
    t.scale = 1;
  }
  return t;
}

/** Update a clip's placement; text keeps its anchor in x/y, media in transform. */
export function placementPatch(clip: MediaClip, patch: Partial<ClipTransform>): Partial<MediaClip>;
export function placementPatch(clip: TextClip, patch: Partial<ClipTransform>): Partial<TextClip>;
export function placementPatch(clip: ShapeClip, patch: Partial<ClipTransform>): Partial<ShapeClip>;
export function placementPatch(clip: Clip, patch: Partial<ClipTransform>): Partial<MediaClip> | Partial<TextClip> | Partial<ShapeClip>;
export function placementPatch(clip: Clip, patch: Partial<ClipTransform>): Partial<MediaClip> | Partial<TextClip> | Partial<ShapeClip> {
  const next = { ...getTransform(clip), ...patch };
  if (clip.kind === "text") {
    const out: Partial<TextClip> = { transform: next };
    if (patch.x !== undefined) out.x = patch.x;
    if (patch.y !== undefined) out.y = patch.y;
    return out;
  }
  return { transform: next };
}

export function isVisualClip(clip: Clip): boolean {
  return clip.kind === "video" || clip.kind === "image" || clip.kind === "text" || clip.kind === "shape";
}

function mediaSource(clip: MediaClip, src: RenderSources): { el: CanvasImageSource; w: number; h: number } | null {
  if (clip.kind === "video") {
    const v = src.videos.get(clip.mediaId);
    return v && v.videoWidth ? { el: v, w: v.videoWidth, h: v.videoHeight } : null;
  }
  if (clip.kind === "image") {
    const img = src.images.get(clip.mediaId);
    return img && img.naturalWidth ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
  }
  return null;
}

function cropOf(clip: MediaClip) {
  const c = clip.crop;
  const cl = (v: number | undefined) => Math.max(0, Math.min(0.9, v ?? 0));
  const left = cl(c?.left);
  const top = cl(c?.top);
  const right = Math.min(cl(c?.right), 0.95 - left);
  const bottom = Math.min(cl(c?.bottom), 0.95 - top);
  return { left, top, right, bottom };
}

function fontFor(text: TextClip, size: number): string {
  return `${text.italic ? "italic " : ""}${text.fontWeight} ${size}px ${text.fontFamily}`;
}

function textLines(text: TextClip): string[] {
  const raw = text.uppercase ? text.text.toUpperCase() : text.text;
  return raw.split(/\n/);
}

function setLetterSpacing(ctx: Ctx2D, px: number) {
  // Chromium and Firefox support ctx.letterSpacing; older engines ignore it.
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${px}px`;
}

interface TextLayout {
  size: number;
  lh: number;
  lines: string[];
  widths: number[];
  maxW: number;
  pad: number;
}

function layoutText(ctx: Ctx2D, text: TextClip, H: number): TextLayout {
  const size = (text.fontSize / 1080) * H;
  const lh = size * (text.lineHeight ?? 1.2);
  ctx.save();
  ctx.font = fontFor(text, size);
  setLetterSpacing(ctx, ((text.letterSpacing ?? 0) / 1080) * H);
  const lines = textLines(text);
  const widths = lines.map((ln) => ctx.measureText(ln).width);
  ctx.restore();
  const pad = text.background ? (text.background.padding / 1080) * H : size * 0.2;
  return { size, lh, lines, widths, maxW: Math.max(...widths, 1), pad };
}

/** Where a clip sits, in canvas pixels. Null while its media has not decoded yet. */
export function clipBox(ctx: Ctx2D, clip: Clip, W: number, H: number, src: RenderSources): ClipBox | null {
  const m = clip.kind === "image" || clip.kind === "video" ? mediaSource(clip as MediaClip, src) : null;
  return clipBoxForSize(ctx, clip, W, H, m ? { w: m.w, h: m.h } : null);
}

/** Same as clipBox, from known source dimensions instead of decoded elements. */
export function clipBoxForSize(
  ctx: Ctx2D, clip: Clip, W: number, H: number, size: { w: number; h: number } | null,
): ClipBox | null {
  const tr = getTransform(clip);
  if (clip.kind === "text") {
    const l = layoutText(ctx, clip, H);
    const w = l.maxW + l.pad * 2;
    const h = l.lines.length * l.lh + l.pad * 2;
    const ax = clip.x * W;
    const cx = clip.align === "centre" ? ax : clip.align === "left" ? ax + l.maxW / 2 : ax - l.maxW / 2;
    return { cx, cy: clip.y * H, w, h, rotation: tr.rotation };
  }
  if (clip.kind === "shape") {
    return { cx: tr.x * W, cy: tr.y * H, w: Math.max(1, clip.w * W * tr.scale), h: Math.max(1, clip.h * H * tr.scale), rotation: tr.rotation };
  }
  if (clip.kind === "audio" || !size || !size.w || !size.h) return null;
  const m = size;
  const c = cropOf(clip);
  const sw = m.w * (1 - c.left - c.right);
  const sh = m.h * (1 - c.top - c.bottom);
  const fit = clip.fit === "cover" ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  return { cx: tr.x * W, cy: tr.y * H, w: sw * fit * tr.scale, h: sh * fit * tr.scale, rotation: tr.rotation };
}

/** True when canvas point (px, py) falls inside the clip's rotated box. */
export function pointInBox(box: ClipBox, px: number, py: number, slop = 0): boolean {
  const rad = (-box.rotation * Math.PI) / 180;
  const dx = px - box.cx;
  const dy = py - box.cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= box.w / 2 + slop && Math.abs(ly) <= box.h / 2 + slop;
}

export function cssFilterFor(clip: Clip, extraBlur = 0): string {
  const parts: string[] = [];
  if (clip.kind === "video" || clip.kind === "image") {
    const e = clip.effects;
    if (e) {
      if (e.brightness !== undefined && e.brightness !== 1) parts.push(`brightness(${e.brightness})`);
      if (e.contrast !== undefined && e.contrast !== 1) parts.push(`contrast(${e.contrast})`);
      if (e.saturation !== undefined && e.saturation !== 1) parts.push(`saturate(${e.saturation})`);
      if (e.grayscale !== undefined && e.grayscale > 0) parts.push(`grayscale(${e.grayscale})`);
      if (e.sepia !== undefined && e.sepia > 0) parts.push(`sepia(${e.sepia})`);
      if (e.hueRotate !== undefined && e.hueRotate !== 0) parts.push(`hue-rotate(${e.hueRotate}deg)`);
      if (e.invert !== undefined && e.invert > 0) parts.push(`invert(${e.invert})`);
      const totalBlur = (e.blur ?? 0) + extraBlur;
      if (totalBlur > 0) parts.push(`blur(${totalBlur}px)`);
      return parts.length ? parts.join(" ") : "none";
    }
  }
  if (extraBlur > 0) parts.push(`blur(${extraBlur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function applyShadow(ctx: Ctx2D, clip: Clip, H: number) {
  const s = clip.shadow;
  if (!s || s.opacity <= 0) return;
  const k = H / 1080;
  ctx.shadowColor = hexToRgba(s.color, s.opacity);
  ctx.shadowBlur = s.blur * k;
  ctx.shadowOffsetX = s.offsetX * k;
  ctx.shadowOffsetY = s.offsetY * k;
}

function clearShadow(ctx: Ctx2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw one clip at timeline time `t`. The caller owns transition effects
 * (translate / clip rect / alpha) and wraps this in save/restore.
 */
export function drawClip(ctx: Ctx2D, W: number, H: number, clip: Clip, t: number, src: RenderSources) {
  if (!isVisualClip(clip) || clip.hidden) return;
  const box = clipBox(ctx, clip, W, H, src);
  if (!box) return;
  const tr = getTransform(clip);
  const anim = computeClipAnimation(clip, t);
  const baseAlpha = ctx.globalAlpha;

  ctx.save();
  // Entrance/exit animations move and scale around the canvas centre, as before.
  ctx.translate(W / 2 + anim.dx * W, H / 2 + anim.dy * H);
  if (anim.scale !== 1) ctx.scale(anim.scale, anim.scale);
  ctx.translate(-W / 2, -H / 2);

  // Then the clip's own placement, around its own centre.
  ctx.translate(box.cx, box.cy);
  if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
  if (tr.flipH || tr.flipV) ctx.scale(tr.flipH ? -1 : 1, tr.flipV ? -1 : 1);

  let alpha = baseAlpha * anim.alpha * (tr.opacity ?? 1);
  if (clip.kind === "text" && !clip.animateIn && !clip.animateOut) {
    // Historical soft fade for text clips without an explicit animation.
    const into = t - clip.start;
    const outof = clip.start + clip.duration - t;
    alpha *= Math.max(0, Math.min(1, into / TEXT_FADE, outof / TEXT_FADE, 1));
  }
  ctx.globalAlpha = alpha;
  ctx.filter = cssFilterFor(clip, anim.blurPx);
  if (clip.blend && clip.blend !== "normal") ctx.globalCompositeOperation = clip.blend;

  if (clip.kind === "text") drawText(ctx, clip, box, H);
  else if (clip.kind === "shape") drawShape(ctx, clip, box, H);
  else drawMedia(ctx, clip as MediaClip, box, H, src);

  ctx.restore();
}

function drawMedia(ctx: Ctx2D, clip: MediaClip, box: ClipBox, H: number, src: RenderSources) {
  const m = mediaSource(clip, src);
  if (!m) return;
  const c = cropOf(clip);
  const sx = m.w * c.left;
  const sy = m.h * c.top;
  const sw = m.w * (1 - c.left - c.right);
  const sh = m.h * (1 - c.top - c.bottom);
  const x = -box.w / 2;
  const y = -box.h / 2;
  const r = ((clip.radius ?? 0) / 1080) * H;

  if (r > 0) {
    if (clip.shadow && clip.shadow.opacity > 0) {
      ctx.save();
      applyShadow(ctx, clip, H);
      ctx.fillStyle = "#000";
      roundRectPath(ctx, x, y, box.w, box.h, r);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    roundRectPath(ctx, x, y, box.w, box.h, r);
    ctx.clip();
    ctx.drawImage(m.el, sx, sy, sw, sh, x, y, box.w, box.h);
    ctx.restore();
  } else {
    // Without rounding the shadow follows the image's own alpha, so cut-outs cast a true shadow.
    applyShadow(ctx, clip, H);
    ctx.drawImage(m.el, sx, sy, sw, sh, x, y, box.w, box.h);
    clearShadow(ctx);
  }
}

/** Build the outline of a shape centred on the origin. */
export function shapePath(ctx: Ctx2D, shape: ShapeClip["shape"], w: number, h: number, radius = 0) {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  switch (shape) {
    case "rect":
      roundRectPath(ctx, -hw, -hh, w, h, radius);
      return;
    case "ellipse":
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      break;
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = Math.cos(a) * hw;
        const y = Math.sin(a) * hh;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        const r = i % 2 === 0 ? 1 : 0.42;
        const x = Math.cos(a) * hw * r;
        const y = Math.sin(a) * hh * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    case "heart":
      ctx.moveTo(0, hh);
      ctx.bezierCurveTo(-hw * 1.1, hh * 0.1, -hw * 0.9, -hh * 1.1, 0, -hh * 0.45);
      ctx.bezierCurveTo(hw * 0.9, -hh * 1.1, hw * 1.1, hh * 0.1, 0, hh);
      break;
    case "line":
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      return;
    case "arrow": {
      const head = Math.min(w * 0.3, Math.max(h * 1.5, 12));
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      ctx.moveTo(hw - head, -head * 0.6);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw - head, head * 0.6);
      return;
    }
  }
  ctx.closePath();
}

function drawShape(ctx: Ctx2D, clip: ShapeClip, box: ClipBox, H: number) {
  const k = H / 1080;
  const open = clip.shape === "line" || clip.shape === "arrow";
  shapePath(ctx, clip.shape, box.w, box.h, (clip.radius ?? 0) * k);
  applyShadow(ctx, clip, H);
  if (!open && clip.fill) {
    ctx.fillStyle = clip.fill;
    ctx.fill();
    clearShadow(ctx);
  }
  const stroke = clip.stroke ?? (open ? { color: clip.fill ?? "#ffffff", width: 8 } : null);
  if (stroke && stroke.width > 0) {
    ctx.lineWidth = stroke.width * k;
    ctx.strokeStyle = stroke.color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  clearShadow(ctx);
}

function drawText(ctx: Ctx2D, text: TextClip, box: ClipBox, H: number) {
  const l = layoutText(ctx, text, H);
  ctx.font = fontFor(text, l.size);
  setLetterSpacing(ctx, ((text.letterSpacing ?? 0) / 1080) * H);
  ctx.textBaseline = "middle";
  ctx.textAlign = text.align === "centre" ? "center" : text.align;
  // Local frame: origin is the box centre.
  const ax = text.align === "centre" ? 0 : text.align === "left" ? -l.maxW / 2 : l.maxW / 2;
  const startY = -((l.lines.length - 1) * l.lh) / 2;

  if (text.background && text.background.opacity > 0) {
    const radius = Math.max(0, (text.background.radius / 1080) * H);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * text.background.opacity;
    ctx.fillStyle = text.background.color;
    applyShadow(ctx, text, H);
    roundRectPath(ctx, -box.w / 2, -box.h / 2, box.w, box.h, radius);
    ctx.fill();
    clearShadow(ctx);
    ctx.globalAlpha = a;
  } else {
    applyShadow(ctx, text, H);
  }

  if (text.stroke && text.stroke.width > 0) {
    ctx.lineWidth = (text.stroke.width / 1080) * H;
    ctx.strokeStyle = text.stroke.color;
    ctx.lineJoin = "round";
    l.lines.forEach((ln, i) => ctx.strokeText(ln, ax, startY + i * l.lh));
    clearShadow(ctx);
  }

  ctx.fillStyle = text.color;
  l.lines.forEach((ln, i) => ctx.fillText(ln, ax, startY + i * l.lh));
  clearShadow(ctx);

  if (text.underline) {
    const thick = Math.max(1, l.size * 0.06);
    l.lines.forEach((_, i) => {
      const w = l.widths[i];
      const left = text.align === "centre" ? ax - w / 2 : text.align === "left" ? ax : ax - w;
      ctx.fillRect(left, startY + i * l.lh + l.size * 0.45, w, thick);
    });
  }
}
