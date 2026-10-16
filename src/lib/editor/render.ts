import { freehandPath } from "./freehand";
import { vectorSymbolPath } from "./vectorSymbols";
import { drawConnector } from "./connectors";
import { applyPhotoTone, needsPhotoTone } from "./photoTone";
import { textRevealLines } from "./textReveal";
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
import type { Clip, ClipTransform, KeyframeProp, MediaClip, ShapeClip, TextClip, TextStroke } from "./types";
import { computeClipAnimation } from "./animationPresets";
import { videoMatteFrame } from "./videoMatte";
import { gifImageFrame } from "./gifImage";
import { measuredTextLayout } from "./textLayout";
import { drawDataVisual } from "./dataVisuals";
import { createGradientFill } from "./gradientFill";
import { drawQrGraphic } from "./qrGraphic";
import { shapePolygon } from "./shapeGeometry";
import { KEY_EPSILON, isAnimated, keyframeProps, resolveClipAt, setKey, staticValue } from "./keyframes";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderSources {
  videos: Map<string, HTMLVideoElement>;
  videosByClip?: Map<string, HTMLVideoElement>;
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

/**
 * placementPatch at timeline time t. Properties that are keyframed get a key
 * at t (added or updated) instead of a new static value, so dragging an
 * animated layer on the canvas edits its motion rather than being ignored.
 *
 * With `record`, a property that is not animated yet starts animating: a key
 * holding its old value at the clip's start, and one with the new value at t.
 * That is the whole gesture for a beginner: move the playhead, move the layer.
 */
export function placementPatchAt(clip: Clip, patch: Partial<ClipTransform>, t: number, opts?: { record?: boolean }): Partial<Clip> {
  const local = t - clip.start;
  const recording = !!opts?.record && local > KEY_EPSILON;
  if (!isAnimated(clip) && !recording) return placementPatch(clip, patch);
  const keyable = keyframeProps(clip);
  let keyframes = clip.keyframes;
  const rest: Partial<ClipTransform> = {};
  for (const [k, v] of Object.entries(patch)) {
    const prop = k as KeyframeProp;
    const animated = isAnimated(clip, prop);
    if (typeof v === "number" && keyable.includes(prop) && (animated || recording)) {
      if (!animated) keyframes = setKey({ ...clip, keyframes } as Clip, prop, 0, staticValue(clip, prop));
      keyframes = setKey({ ...clip, keyframes } as Clip, prop, local, v);
    } else {
      (rest as Record<string, unknown>)[k] = v;
    }
  }
  return { ...(Object.keys(rest).length ? placementPatch(clip, rest) : {}), keyframes };
}

export function isVisualClip(clip: Clip): boolean {
  return clip.kind === "video" || clip.kind === "image" || clip.kind === "text" || clip.kind === "shape";
}

function mediaSource(clip: MediaClip, src: RenderSources, sourceTime?: number): { el: CanvasImageSource; w: number; h: number } | null {
  if (clip.kind === "video") {
    const v = src.videosByClip?.get(clip.id) ?? src.videos.get(clip.mediaId);
    return v && v.videoWidth ? { el: v, w: v.videoWidth, h: v.videoHeight } : null;
  }
  if (clip.kind === "image") {
    const img = src.images.get(clip.mediaId);
    return img && img.naturalWidth ? { el: sourceTime === undefined ? img : gifImageFrame(img, sourceTime), w: img.naturalWidth, h: img.naturalHeight } : null;
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

function setLetterSpacing(ctx: Ctx2D, px: number) {
  (ctx as unknown as { letterSpacing?: string }).letterSpacing = `${px}px`;
}

function layoutText(ctx: Ctx2D, text: TextClip, W: number, H: number) {
  ctx.save();
  const result = measuredTextLayout(text, W, H, (line, size, spacing) => {
    ctx.font = fontFor(text, size);
    setLetterSpacing(ctx, spacing);
    return ctx.measureText(line).width;
  });
  ctx.restore();
  return result;
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
    const l = layoutText(ctx, clip, W, H);
    const w = (l.curve ? l.curve.width : l.maxW) + l.pad * 2;
    const h = (l.curve ? l.curve.height : l.lines.length * l.lh) + l.pad * 2;
    const ax = clip.x * W;
    const cx = clip.align === "centre" ? ax : clip.align === "left" ? ax + (l.curve ? l.curve.width : l.maxW) / 2 : ax - (l.curve ? l.curve.width : l.maxW) / 2;
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
export function drawClip(ctx: Ctx2D, W: number, H: number, keyed: Clip, t: number, src: RenderSources, sourceTime?: number) {
  if (!isVisualClip(keyed) || keyed.hidden) return;
  // Keyframed placement is baked in first; everything below sees a plain clip.
  const clip = resolveClipAt(keyed, t);
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
  if (anim.rotation) ctx.rotate(anim.rotation * Math.PI / 180);
  for (const reveal of anim.reveals ?? []) {
    const progress = Math.max(0, Math.min(1, reveal.progress));
    const width = reveal.axis === "x" ? box.w * progress : box.w;
    const height = reveal.axis === "y" ? box.h * progress : box.h;
    const x = -box.w / 2 + (reveal.axis === "x" && reveal.from === "end" ? box.w - width : 0);
    const y = -box.h / 2 + (reveal.axis === "y" && reveal.from === "end" ? box.h - height : 0);
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }

  // Text used to fade in over its first 0.3s by default, which made every
  // title invisible at 0s: exactly where a still design sits and where PNG
  // export captures. Fades are an explicit animation now (animateIn "fade").
  ctx.globalAlpha = baseAlpha * anim.alpha * (tr.opacity ?? 1);
  ctx.filter = cssFilterFor(clip, anim.blurPx);
  if (clip.blend && clip.blend !== "normal") ctx.globalCompositeOperation = clip.blend;

  if (clip.kind === "text") drawText(ctx, clip, box, W, H, anim.textProgress);
  else if (clip.kind === "shape") drawShape(ctx, clip, box, H);
  else drawMedia(ctx, clip as MediaClip, box, H, src, sourceTime ?? ((clip as MediaClip).trimIn + (t - clip.start) * ((clip as MediaClip).speed ?? 1)));

  ctx.restore();
}

// ── Colour grading (warmth, tint, vignette) ──
// CSS filters cannot shift white balance or vignette, so graded clips are
// drawn to a scratch canvas first. The grade is confined to the clip's own
// pixels (destination-in against the source), so a cut-out never tints the
// layers beneath it. One scratch canvas is reused for every clip and frame.
let scratch: OffscreenCanvas | HTMLCanvasElement | null = null;
const stillGradeCache = new WeakMap<HTMLImageElement, { key: string; el: CanvasImageSource; w: number; h: number }>();

function scratchCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (!scratch) {
    if (typeof OffscreenCanvas !== "undefined") scratch = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") scratch = document.createElement("canvas");
    else return null;
  }
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  return scratch;
}

export function needsGrade(e: MediaClip["effects"]): boolean {
  return !!e && (!!e.warmth || !!e.tint || !!e.vignette || needsPhotoTone(e));
}

function grade(el: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number, e: NonNullable<MediaClip["effects"]>) {
  // Cap the working size: grading is about colour, not detail, and a 4K frame
  // per tick would be wasted work.
  const k = Math.min(1, 1600 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k));
  const ch = Math.max(1, Math.round(h * k));
  const still = typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement ? el : null;
  const cacheKey = still ? [still.currentSrc || still.src, sx, sy, sw, sh, cw, ch, JSON.stringify(e)].join("|") : "";
  const cached = still ? stillGradeCache.get(still) : null;
  if (cached?.key === cacheKey) return cached;
  const cvs = scratchCanvas(cw, ch);
  const g = cvs?.getContext("2d") as Ctx2D | null;
  if (!cvs || !g) return null;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.filter = "none";
  g.globalCompositeOperation = "copy";
  g.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
  if (needsPhotoTone(e)) {
    const image = g.getImageData(0, 0, cw, ch);
    applyPhotoTone(image.data, e, true);
    g.putImageData(image, 0, 0);
  }
  const fillBlend = (colour: string, alpha: number, mode: GlobalCompositeOperation) => {
    g.globalCompositeOperation = mode;
    g.globalAlpha = alpha;
    g.fillStyle = colour;
    g.fillRect(0, 0, cw, ch);
  };
  const warmth = Math.max(-1, Math.min(1, e.warmth ?? 0));
  if (warmth) fillBlend(warmth > 0 ? "#ff9a2e" : "#2e7bff", Math.abs(warmth) * 0.35, "soft-light");
  const tint = Math.max(-1, Math.min(1, e.tint ?? 0));
  if (tint) fillBlend(tint > 0 ? "#ff3ec8" : "#3eff6a", Math.abs(tint) * 0.3, "soft-light");
  const vignette = Math.max(0, Math.min(1, e.vignette ?? 0));
  if (vignette) {
    const grad = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.hypot(cw, ch) / 2);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${0.85 * vignette})`);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, ch);
  }
  // Put the source's own transparency back.
  g.globalCompositeOperation = "destination-in";
  g.globalAlpha = 1;
  g.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
  g.globalCompositeOperation = "source-over";
  if (still) {
    const copy = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(cw, ch) : document.createElement("canvas");
    copy.width = cw; copy.height = ch;
    const context = copy.getContext("2d") as Ctx2D | null;
    if (context) { context.drawImage(cvs, 0, 0); const result = { key: cacheKey, el: copy as CanvasImageSource, w: cw, h: ch }; stillGradeCache.set(still, result); return result; }
  }
  return { el: cvs as CanvasImageSource, w: cw, h: ch };
}

let matteCanvas: HTMLCanvasElement | null = null;

function drawMedia(ctx: Ctx2D, clip: MediaClip, box: ClipBox, H: number, src: RenderSources, sourceTime: number) {
  const m = mediaSource(clip, src, sourceTime);
  if (!m) return;
  const c = cropOf(clip);
  let el = m.el;
  let sx = m.w * c.left;
  let sy = m.h * c.top;
  let sw = m.w * (1 - c.left - c.right);
  let sh = m.h * (1 - c.top - c.bottom);
  if (clip.kind === "video" && clip.videoMatte) {
    const frame = videoMatteFrame(clip, sourceTime), image = frame ? src.images.get(frame.mediaId) : undefined;
    if (!frame || !image?.naturalWidth || image.naturalWidth !== frame.atlasWidth || image.naturalHeight !== frame.atlasHeight) return;
    matteCanvas ??= document.createElement("canvas");
    const scale = Math.min(1, 1920 / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * scale)), height = Math.max(1, Math.round(sh * scale));
    if (matteCanvas.width !== width) matteCanvas.width = width;
    if (matteCanvas.height !== height) matteCanvas.height = height;
    const g = matteCanvas.getContext("2d"); if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0); g.filter = "none"; g.globalAlpha = 1; g.globalCompositeOperation = "copy";
    g.drawImage(el, sx, sy, sw, sh, 0, 0, width, height);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(image, frame.x + frame.width * c.left, frame.y + frame.height * c.top, frame.width * (1 - c.left - c.right), frame.height * (1 - c.top - c.bottom), 0, 0, width, height);
    g.globalCompositeOperation = "source-over";
    el = matteCanvas; sx = 0; sy = 0; sw = width; sh = height;
  }
  if (needsGrade(clip.effects)) {
    const graded = grade(el, sx, sy, sw, sh, Math.abs(box.w), Math.abs(box.h), clip.effects!);
    if (graded) {
      el = graded.el;
      sx = 0;
      sy = 0;
      sw = graded.w;
      sh = graded.h;
    }
  }
  const x = -box.w / 2;
  const y = -box.h / 2;
  const r = ((clip.radius ?? 0) / 1080) * H;
  const framePath = () => clip.frame && clip.frame !== "rect"
    ? shapePath(ctx, clip.frame, box.w, box.h) : roundRectPath(ctx, x, y, box.w, box.h, r);

  if (r > 0 || (clip.frame && clip.frame !== "rect")) {
    if (clip.shadow && clip.shadow.opacity > 0) {
      ctx.save();
      applyShadow(ctx, clip, H);
      ctx.fillStyle = "#000";
      framePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    framePath();
    ctx.clip();
    ctx.drawImage(el, sx, sy, sw, sh, x, y, box.w, box.h);
    ctx.restore();
  } else {
    // Without rounding the shadow follows the image's own alpha, so cut-outs cast a true shadow.
    applyShadow(ctx, clip, H);
    ctx.drawImage(el, sx, sy, sw, sh, x, y, box.w, box.h);
    clearShadow(ctx);
  }
  if (clip.border && clip.border.width > 0) {
    ctx.save(); framePath();
    ctx.lineWidth = clip.border.width * H / 1080; ctx.strokeStyle = clip.border.color;
    ctx.setLineDash((Array.isArray(clip.border.dash) ? clip.border.dash : []).filter(n => Number.isFinite(n) && n >= 0).slice(0, 8).map(n => n * H / 1080));
    ctx.stroke(); ctx.restore();
  }
}

/** Build the outline of a shape centred on the origin. */
export function shapePath(ctx: Ctx2D, shape: ShapeClip["shape"], w: number, h: number, radius = 0, points?: [number, number][], geometry?: ShapeClip["geometry"]) {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  const polygon = shapePolygon(shape, w, h, geometry);
  if (polygon) {
    polygon.forEach((point, index) => { if (index === 0) ctx.moveTo(point[0], point[1]); else ctx.lineTo(point[0], point[1]); });
    ctx.closePath(); return;
  }
  switch (shape) {
    case "path": {
      // Midpoint quadratic smoothing: the curve passes through the midpoint of
      // each pair of samples, using the samples as control points.
      const p = points ?? [];
      if (!p.length) return;
      const X = (i: number) => p[i][0] * w;
      const Y = (i: number) => p[i][1] * h;
      ctx.moveTo(X(0), Y(0));
      if (p.length === 1) {
        ctx.lineTo(X(0) + 0.01, Y(0));
        return;
      }
      for (let i = 1; i < p.length - 1; i++) {
        ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
      }
      ctx.lineTo(X(p.length - 1), Y(p.length - 1));
      return;
    }
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
  if (clip.photoFrame) {
    drawShape(ctx, { ...clip, photoFrame: false }, box, H);
    const size = Math.min(box.w, box.h) * 0.35;
    ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.moveTo(-size, size * 0.65); ctx.lineTo(-size * 0.2, -size * 0.45); ctx.lineTo(size * 0.25, size * 0.2); ctx.lineTo(size * 0.55, -size * 0.2); ctx.lineTo(size, size * 0.65); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.55, -size * 0.65, size * 0.18, 0, Math.PI * 2); ctx.fill(); return;
  }
  if (clip.qr) { drawQrGraphic(ctx, box.w, box.h, clip.qr); return; }
  if (clip.chart || clip.table) {
    drawDataVisual(ctx, box.w, box.h, clip.chart, clip.table);
    return;
  }
  const k = H / 1080;
  if (clip.connector) {
    const stroke = clip.stroke ?? { color: clip.fill ?? "#ffffff", width: 8 };
    if (stroke.width <= 0) return;
    ctx.lineWidth = stroke.width * k;
    ctx.strokeStyle = createGradientFill(ctx, box.w, box.h, clip.gradient) || stroke.color;
    ctx.setLineDash((stroke.dash || []).filter(Number.isFinite).slice(0, 8).map(value => Math.max(0, value) * k));
    applyShadow(ctx, clip, H); drawConnector(ctx, box.w, box.h, clip.connector); clearShadow(ctx); return;
  }
  const open = clip.shape === "line" || clip.shape === "arrow" || (clip.shape === "path" && !clip.closedPath);
  if (clip.symbol) vectorSymbolPath(ctx, box.w, box.h, clip.symbol);
  else if (clip.shape === "path") freehandPath(ctx, box.w, box.h, clip.points ?? [], clip.pathSmoothing ?? 1, !!clip.closedPath);
  else shapePath(ctx, clip.shape, box.w, box.h, (clip.radius ?? 0) * k, clip.points, clip.geometry);
  applyShadow(ctx, clip, H);
  const gradient = createGradientFill(ctx, box.w, box.h, clip.gradient);
  if (!open && (clip.fill || (!clip.symbol && gradient))) {
    ctx.fillStyle = gradient ?? clip.fill!;
    ctx.fill();
    clearShadow(ctx);
  }
  const stroke: TextStroke | null = clip.stroke ?? (open ? { color: clip.fill ?? "#ffffff", width: 8 } : null);
  if (stroke && stroke.width > 0) {
    ctx.setLineDash((Array.isArray(stroke.dash) ? stroke.dash : []).filter(n => Number.isFinite(n) && n >= 0).slice(0, 8).map(n => n * k));
    ctx.lineWidth = stroke.width * k;
    ctx.strokeStyle = (open || clip.symbol) && gradient ? gradient : stroke.color;
    ctx.lineJoin = clip.strokeJoin ?? "round";
    ctx.lineCap = clip.shape === "path" && clip.points?.length === 1 ? "round" : clip.strokeCap ?? "round";
    ctx.stroke();
  }
  clearShadow(ctx);
}

function drawText(ctx: Ctx2D, text: TextClip, box: ClipBox, W: number, H: number, progress?: number) {
  const l = layoutText(ctx, text, W, H);
  ctx.font = fontFor(text, l.size);
  setLetterSpacing(ctx, l.spacing);
  ctx.textBaseline = "middle";
  ctx.textAlign = text.align === "centre" ? "center" : text.align;
  // Local frame: origin is the box centre.
  const ax = text.align === "centre" ? 0 : text.align === "left" ? -l.maxW / 2 : l.maxW / 2;
  const startY = -((l.lines.length - 1) * l.lh) / 2;
  const lines = progress === undefined ? l.lines : textRevealLines(l.lines, progress);
  const leftFor = (i: number) => text.align === "centre" ? ax - l.widths[i] / 2 : text.align === "left" ? ax : ax - l.widths[i];
  const drawX = (i: number) => progress === undefined ? ax : leftFor(i);
  if (progress !== undefined) ctx.textAlign = "left";

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

  const drawEcho = (value: string, x: number, y: number) => {
    const alpha = ctx.globalAlpha, fill = ctx.fillStyle;
    for (const layer of (text.echo || []).slice(0, 3)) {
      if (!/^#[\da-f]{6}$/i.test(layer.colour) || ![layer.x, layer.y, layer.opacity].every(Number.isFinite)) continue;
      ctx.globalAlpha = alpha * Math.max(0, Math.min(1, layer.opacity));
      ctx.fillStyle = layer.colour;
      ctx.fillText(value, x + Math.max(-100, Math.min(100, layer.x)) / 1080 * H * l.scale, y + Math.max(-100, Math.min(100, layer.y)) / 1080 * H * l.scale);
    }
    ctx.globalAlpha = alpha; ctx.fillStyle = fill;
  };
  if (l.curve) {
    ctx.textAlign = "center";
    setLetterSpacing(ctx, 0);
    const glyphs = l.curve.glyphs;
    const visible = progress == null ? glyphs.length : Math.floor(glyphs.length * Math.max(0, Math.min(1, progress)) + 1e-7);
    const outline: TextStroke | null = text.stroke || (text.hollow ? { color: text.color, width: 3 } : null);
    ctx.fillStyle = createGradientFill(ctx, box.w, box.h, text.gradient) || text.color;
    if (outline) {
      ctx.strokeStyle = outline.color;
      ctx.lineWidth = outline.width / 1080 * H * l.scale;
      ctx.lineJoin = "round";
      ctx.setLineDash((Array.isArray(outline.dash) ? outline.dash : []).filter(n => Number.isFinite(n) && n >= 0).slice(0, 8).map(n => n * H / 1080));
    }
    glyphs.slice(0, visible).forEach(glyph => {
      ctx.save();
      ctx.translate(glyph.x, glyph.y);
      ctx.rotate(glyph.rotation);
      drawEcho(glyph.text, 0, 0);
      if (outline && outline.width > 0) ctx.strokeText(glyph.text, 0, 0);
      if (!text.hollow) ctx.fillText(glyph.text, 0, 0);
      clearShadow(ctx);
      if (text.strikethrough) ctx.fillRect(-glyph.width / 2, 0, glyph.width, Math.max(1, l.size * 0.055));
      if (text.underline) ctx.fillRect(-glyph.width / 2, l.size * 0.45, glyph.width, Math.max(1, l.size * 0.06));
      ctx.restore();
    });
    clearShadow(ctx);
    return;
  }
  lines.forEach((line, index) => drawEcho(line, drawX(index), startY + index * l.lh));
  const textStroke: TextStroke | null = text.stroke ?? (text.hollow ? { color: text.color, width: 3 } : null);
  if (textStroke && textStroke.width > 0) {
    ctx.setLineDash((Array.isArray(textStroke.dash) ? textStroke.dash : []).filter(n => Number.isFinite(n) && n >= 0).slice(0, 8).map(n => n * H / 1080));
    ctx.lineWidth = (textStroke.width / 1080) * H * l.scale;
    ctx.strokeStyle = textStroke.color;
    ctx.lineJoin = "round";
    lines.forEach((ln, i) => ctx.strokeText(ln, drawX(i), startY + i * l.lh));
    clearShadow(ctx);
  }

  ctx.fillStyle = createGradientFill(ctx, box.w, box.h, text.gradient) ?? text.color;
  if (!text.hollow) lines.forEach((ln, i) => ctx.fillText(ln, drawX(i), startY + i * l.lh));
  clearShadow(ctx);

  if (text.strikethrough) {
    l.lines.forEach((_, i) => {
      const width = progress === undefined ? l.widths[i] : ctx.measureText(lines[i]).width, left = leftFor(i);
      ctx.fillRect(left, startY + i * l.lh, width, Math.max(1, l.size * 0.055));
    });
  }
  if (text.underline) {
    const thick = Math.max(1, l.size * 0.06);
    l.lines.forEach((_, i) => {
      const w = progress === undefined ? l.widths[i] : ctx.measureText(lines[i]).width;
      const left = leftFor(i);
      ctx.fillRect(left, startY + i * l.lh + l.size * 0.45, w, thick);
    });
  }
}
