/**
 * Editor agent — client half.
 * ===========================
 * `describeScene` turns the design into a compact text summary, the
 * editor-agent edge function asks a cheap model for a list of operations, and
 * `applyOps` carries them out here in the browser through the normal store
 * actions. The server never renders, downloads or stores anything, which is
 * what keeps a request at a fraction of a cent.
 *
 * One request is one undo step (runAsOneStep), however many layers it touched.
 */
import { useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import type { AspectPreset, BlendMode, Clip, ClipAnimationKind, ClipEffects, MediaClip, ShapeClip, ShapeKind, TextClip } from "./types";
import { BLEND_MODES, SHAPE_KINDS, aspectToDims } from "./types";
import { clipBox, getTransform, placementPatch } from "./render";
import { applyFilterPreset } from "./filterPresets";
import { GOOGLE_FONTS, fontFamilyCss, loadGoogleFont } from "./googleFonts";
import { downloadFreeAsset, provenanceForAsset, searchFreeAssets, type FreeAssetOrientation } from "./freeAssets";
import { importOneFile } from "./importFiles";
import { getPages, pageAt } from "./pages";
import { useBrandStore, hasBrand } from "@/store/editorBrandStore";
import { applyBrand, addBrandLogo } from "./brand";
import { useBgRemovalStore } from "@/store/editorBgRemovalStore";
import { useCaptionsStore } from "@/store/editorCaptionsStore";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL || "https://aigxuutjaqsywioxjefr.supabase.co"}/functions/v1/editor-agent`;
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/** One operation, as the model returns it. Every field but `op` is optional. */
export interface AgentOp {
  op: string;
  [field: string]: unknown;
}

export interface AgentResult {
  reply: string;
  ops: AgentOp[];
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Compact, model-friendly description of the design. Kept small on purpose: it is most of the input tokens. */
export function describeScene() {
  const s = useEditorStore.getState();
  const trackOrder = new Map(s.tracks.map((t, i) => [t.id, i]));
  const hidden = new Set(s.tracks.filter((t) => t.hidden).map((t) => t.id));
  const layers = s.clips
    .slice()
    .sort((a, b) => (trackOrder.get(a.trackId) ?? 0) - (trackOrder.get(b.trackId) ?? 0))
    .map((c) => describeClip(c, s.media, hidden.has(c.trackId)));
  const duration = s.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const pages = getPages(s.settings, s.clips);
  const kit = useBrandStore.getState().kit;
  const brand = hasBrand(kit)
    ? {
        colors: kit.colors,
        headingFont: kit.headingFont?.split(",")[0].replace(/'/g, ""),
        bodyFont: kit.bodyFont?.split(",")[0].replace(/'/g, ""),
        hasLogo: !!kit.logoMediaId,
      }
    : undefined;
  return {
    brand,
    pages: pages.length > 1 ? pages.map((p) => ({ index: p.index, start: round(p.start, 2), end: round(p.end, 2) })) : undefined,
    currentPage: pages.length > 1 ? pageAt(pages, s.currentTime).index : undefined,
    page: {
      width: s.settings.width,
      height: s.settings.height,
      aspect: s.settings.aspectPreset,
      background: s.settings.background,
      duration: round(duration, 2),
    },
    playhead: round(s.currentTime, 2),
    selected: s.selectedClipIds,
    layers,
    library: s.media.slice(0, 30).map((m) => ({ id: m.id, kind: m.kind, name: m.name })),
  };
}

function describeClip(c: Clip, media: { id: string; name: string }[], hidden: boolean) {
  const tr = getTransform(c);
  const base: Record<string, unknown> = {
    id: c.id,
    kind: c.kind,
    start: round(c.start, 2),
    duration: round(c.duration, 2),
  };
  if (hidden) base.hidden = true;
  if (c.kind !== "audio") {
    base.x = round(tr.x);
    base.y = round(tr.y);
    if (tr.rotation) base.rotation = round(tr.rotation, 1);
    if ((tr.opacity ?? 1) !== 1) base.opacity = round(tr.opacity ?? 1, 2);
  }
  if (c.blend && c.blend !== "normal") base.blend = c.blend;
  if (c.locked) base.locked = true;
  if (c.hidden) base.hiddenLayer = true;
  if (c.animateIn) base.in = c.animateIn.kind;
  if (c.animateOut) base.out = c.animateOut.kind;
  if (c.kind === "text") {
    return {
      ...base,
      text: c.text.slice(0, 200),
      font: c.fontFamily.split(",")[0].replace(/'/g, ""),
      fontSize: c.fontSize,
      fontWeight: c.fontWeight,
      color: c.color,
      align: c.align,
    };
  }
  if (c.kind === "shape") {
    return { ...base, shape: c.shape, w: round(c.w), h: round(c.h), scale: round(tr.scale, 2), fill: c.fill, stroke: c.stroke ?? undefined };
  }
  const m = c as MediaClip;
  const out: Record<string, unknown> = { ...base, name: media.find((x) => x.id === m.mediaId)?.name };
  if (c.kind !== "audio") {
    out.scale = round(tr.scale, 2);
    if (m.fit === "cover") out.fit = "cover";
    if (m.effects) out.effects = m.effects;
    if (m.crop) out.crop = m.crop;
  }
  if (m.speed && m.speed !== 1) out.speed = m.speed;
  if (m.audio?.volume !== undefined) out.volume = m.audio.volume;
  return out;
}

/** Ask the agent. Throws with a user-safe code on failure ("rate_limited" | "unavailable"). */
export async function askAgent(messages: AgentMessage[], signal?: AbortSignal): Promise<AgentResult> {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ messages, scene: describeScene() }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error === "rate_limited" || res.status === 429 ? "rate_limited" : "unavailable");
  return { reply: String(data.reply ?? ""), ops: Array.isArray(data.ops) ? data.ops : [] };
}

// ── Applying operations ──

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const HEX = /^#[0-9a-f]{3,8}$/i;
const colour = (v: unknown) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : undefined);

const ANIMATIONS: ClipAnimationKind[] = [
  "fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom-in", "zoom-out", "pop", "rise", "blur",
];

function fontCss(name: string): string {
  const f = GOOGLE_FONTS.find((g) => g.family.toLowerCase() === name.toLowerCase());
  if (f) {
    loadGoogleFont(f.family, f.weights);
    return fontFamilyCss(f.family, f.category);
  }
  // Not in our list: try it anyway, Google serves most families by name.
  loadGoogleFont(name, [400, 700, 900]);
  return fontFamilyCss(name);
}

function textPatch(op: AgentOp): Partial<TextClip> {
  const p: Partial<TextClip> = {};
  const text = typeof op.text === "string" ? op.text : undefined;
  if (text !== undefined) p.text = text.slice(0, 2000);
  const fontSize = num(op.fontSize);
  if (fontSize !== undefined) p.fontSize = clamp(Math.round(fontSize), 6, 800);
  const fontWeight = num(op.fontWeight);
  if (fontWeight !== undefined) p.fontWeight = clamp(Math.round(fontWeight / 100) * 100, 100, 900);
  const c = colour(op.color);
  if (c) p.color = c;
  const family = str(op.fontFamily);
  if (family) p.fontFamily = fontCss(family);
  if (op.align === "left" || op.align === "centre" || op.align === "right") p.align = op.align;
  const italic = bool(op.italic);
  if (italic !== undefined) p.italic = italic;
  const uppercase = bool(op.uppercase);
  if (uppercase !== undefined) p.uppercase = uppercase;
  const underline = bool(op.underline);
  if (underline !== undefined) p.underline = underline;
  const ls = num(op.letterSpacing);
  if (ls !== undefined) p.letterSpacing = clamp(ls, -20, 200);
  const lh = num(op.lineHeight);
  if (lh !== undefined) p.lineHeight = clamp(lh, 0.6, 4);
  const bg = colour(op.bgColor);
  if (bg) p.background = { color: bg, opacity: clamp(num(op.bgOpacity) ?? 0.6, 0, 1), padding: 24, radius: 16 };
  const stroke = colour(op.strokeColor);
  if (stroke) p.stroke = { color: stroke, width: clamp(num(op.strokeWidth) ?? 4, 0, 40) };
  return p;
}

/** Fields every layer kind shares: blend, lock, hide. */
function layerPatch(op: AgentOp): { blend?: BlendMode; locked?: boolean; hidden?: boolean } {
  const p: { blend?: BlendMode; locked?: boolean; hidden?: boolean } = {};
  if (BLEND_MODES.includes(op.blend as BlendMode)) p.blend = op.blend as BlendMode;
  const locked = bool(op.locked);
  if (locked !== undefined) p.locked = locked;
  const hidden = bool(op.hidden);
  if (hidden !== undefined) p.hidden = hidden;
  return p;
}

function shapePatch(op: AgentOp): Partial<ShapeClip> {
  const p: Partial<ShapeClip> = {};
  const w = num(op.w);
  if (w !== undefined) p.w = clamp(w, 0.005, 3);
  const h = num(op.h);
  if (h !== undefined) p.h = clamp(h, 0.005, 3);
  if (op.fill === "none") p.fill = null;
  const fill = colour(op.fill) ?? colour(op.color);
  if (fill) p.fill = fill;
  const stroke = colour(op.strokeColor);
  if (stroke) p.stroke = { color: stroke, width: clamp(num(op.strokeWidth) ?? 6, 0, 80) };
  const r = num(op.radius);
  if (r !== undefined) p.radius = clamp(r, 0, 540);
  if (SHAPE_KINDS.includes(op.shape as ShapeKind)) p.shape = op.shape as ShapeKind;
  return p;
}

function effectsPatch(op: AgentOp, current: ClipEffects | undefined): ClipEffects | undefined {
  let next: ClipEffects | undefined = current ? { ...current } : undefined;
  const preset = str(op.preset);
  if (preset) next = preset === "none" ? undefined : applyFilterPreset(preset) ?? next;
  const fields: [keyof ClipEffects, number, number][] = [
    ["brightness", 0, 2], ["contrast", 0, 2], ["saturation", 0, 2], ["blur", 0, 20],
    ["grayscale", 0, 1], ["sepia", 0, 1], ["invert", 0, 1], ["hueRotate", 0, 360],
    ["warmth", -1, 1], ["tint", -1, 1], ["vignette", 0, 1],
  ];
  for (const [key, lo, hi] of fields) {
    const v = num(op[key]);
    if (v !== undefined) next = { ...(next ?? {}), [key]: clamp(v, lo, hi) };
  }
  return next;
}

const ASPECTS: [AspectPreset, number][] = [["16:9", 16 / 9], ["1:1", 1], ["4:5", 4 / 5], ["9:16", 9 / 16]];
function nearestAspect(ratio: number): AspectPreset {
  return ASPECTS.reduce((best, cur) => (Math.abs(Math.log(cur[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? cur : best))[0];
}

/**
 * Shrink a text layer that is wider than the page. Small models happily ask
 * for 170px "SUMMER SALE" on a square page, which runs off both edges (seen on
 * staging). Waits briefly for the font so the measurement is the real one.
 */
async function fitTextToPage(id: string) {
  const s = useEditorStore.getState();
  const clip = s.clips.find((c) => c.id === id);
  if (!clip || clip.kind !== "text" || typeof document === "undefined") return;
  const family = clip.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  try {
    await Promise.race([
      document.fonts.load(`${clip.italic ? "italic " : ""}${clip.fontWeight} 100px "${family}"`),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* measure with whatever is loaded */
  }
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  const W = s.settings.width;
  const box = clipBox(ctx, clip, W, s.settings.height, { videos: new Map(), images: new Map() });
  const max = W * 0.9;
  if (box && box.w > max) {
    useEditorStore.getState().patchClip(id, { fontSize: Math.max(12, Math.floor(clip.fontSize * (max / box.w))) });
  }
}

const NOT_A_PHOTO = /illustrat|clip ?art|vector|drawing|cartoon|icon|logo|diagram|sketch|svg/i;

/**
 * Pick the best stock result, not just the first. Openverse's "photograph"
 * category still returns clip-art (a white-background palm-tree illustration
 * came back for "palm trees tropical beach" on staging), so skip anything
 * titled like an illustration and prefer pictures big enough to fill a page.
 */
function pickStock<T extends { title: string; width?: number; mimeType: string }>(items: T[], kind: string): T | undefined {
  if (kind !== "photo") return items[0];
  const photos = items.filter((a) => !NOT_A_PHOTO.test(a.title) && !a.mimeType.includes("svg"));
  return photos.find((a) => (a.width ?? 0) >= 1000) ?? photos[0] ?? items[0];
}

export interface ApplyContext {
  wallet?: string | null;
}

/** What happened, for the chat log. */
export interface ApplyReport {
  applied: number;
  failed: number;
  /** A stock search the agent asked for that found nothing. */
  missingStock: string[];
  /** The agent prepared a paid generation for the user to confirm. */
  generate?: { kind: "image" | "video"; prompt: string };
}

/** Carry out the agent's operations as one undo step. */
export async function applyOps(ops: AgentOp[], ctx: ApplyContext = {}): Promise<ApplyReport> {
  const report: ApplyReport = { applied: 0, failed: 0, missingStock: [] };
  const created: string[] = [];
  const store = () => useEditorStore.getState();
  const resolve = (id: unknown): string | undefined => {
    if (typeof id !== "string") return undefined;
    const m = /^new:(\d+)$/.exec(id);
    return m ? created[Number(m[1])] : id;
  };
  const find = (id: unknown): Clip | undefined => {
    const rid = resolve(id);
    return rid ? store().clips.find((c) => c.id === rid) : undefined;
  };

  const place = (clip: Clip, op: AgentOp) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["x", "y", "scale", "rotation", "opacity"] as const) {
      const v = num(op[k]);
      if (v === undefined) continue;
      patch[k] = k === "x" || k === "y" ? clamp(v, -0.5, 1.5)
        : k === "scale" ? clamp(v, 0.02, 20)
        : k === "opacity" ? clamp(v, 0, 1)
        : v;
    }
    for (const k of ["flipH", "flipV"] as const) {
      const v = bool(op[k]);
      if (v !== undefined) patch[k] = v;
    }
    const out: Record<string, unknown> = Object.keys(patch).length ? { ...placementPatch(clip, patch) } : {};
    if ((op.fit === "cover" || op.fit === "contain") && (clip.kind === "image" || clip.kind === "video")) out.fit = op.fit;
    if (Object.keys(out).length) store().patchClip(clip.id, out);
  };

  await store().runAsOneStep(async () => {
    for (const op of ops) {
      try {
        const ok = await applyOne(op);
        if (ok) report.applied++;
        else report.failed++;
      } catch (e) {
        console.warn("[editor-agent] op failed", op, e);
        report.failed++;
      }
    }
  });
  return report;

  async function applyOne(op: AgentOp): Promise<boolean> {
    const s = store();
    switch (op.op) {
      case "set_canvas": {
        const patch: Record<string, unknown> = {};
        let aspect = op.aspect as AspectPreset | undefined;
        // Small models sometimes send a size instead of an aspect (seen live:
        // x=1080, y=1080). Snap any width/height pair to the nearest preset.
        const big = (v: unknown) => { const n = num(v); return n !== undefined && n > 1 ? n : undefined; };
        const pw = num(op.width) ?? big(op.x);
        const ph = num(op.height) ?? big(op.y);
        if (!aspect && pw && ph && pw > 0 && ph > 0) aspect = nearestAspect(pw / ph);
        if (aspect === "16:9" || aspect === "9:16" || aspect === "1:1" || aspect === "4:5") {
          Object.assign(patch, aspectToDims(aspect, 1080), { aspectPreset: aspect });
        }
        const bg = colour(op.background);
        if (bg) patch.background = bg;
        if (!Object.keys(patch).length) return false;
        s.updateSettings(patch);
        return true;
      }
      case "add_text": {
        const id = s.addTextClip(undefined, num(op.start), { layer: true });
        created.push(id);
        const patch = textPatch(op);
        const x = num(op.x);
        const y = num(op.y);
        if (x !== undefined) patch.x = clamp(x, 0, 1);
        if (y !== undefined) patch.y = clamp(y, 0, 1);
        const d = num(op.duration);
        if (d !== undefined) patch.duration = clamp(d, 0.2, 3600);
        s.patchClip(id, patch);
        const clip = store().clips.find((c) => c.id === id);
        if (clip && (num(op.rotation) !== undefined || num(op.opacity) !== undefined)) place(clip, { op: "place", rotation: op.rotation, opacity: op.opacity });
        await fitTextToPage(id);
        return true;
      }
      case "add_shape": {
        const kind = SHAPE_KINDS.includes(op.shape as ShapeKind) ? (op.shape as ShapeKind) : "rect";
        const id = s.addShapeClip(kind, { ...shapePatch(op), ...layerPatch(op) });
        created.push(id);
        const clip = store().clips.find((c) => c.id === id);
        if (clip) place(clip, op);
        return true;
      }
      case "update": {
        const clip = find(op.id);
        if (!clip) return false;
        if (clip.kind === "text") {
          s.patchClip(clip.id, textPatch(op));
          if (op.text !== undefined || op.fontSize !== undefined || op.fontFamily !== undefined) await fitTextToPage(clip.id);
        }
        if (clip.kind === "shape") s.patchClip(clip.id, shapePatch(op));
        const shared = layerPatch(op);
        if (Object.keys(shared).length) s.patchClip(clip.id, shared);
        place(clip, op);
        return true;
      }
      case "place": {
        const clip = find(op.id);
        if (!clip || clip.kind === "audio") return false;
        place(clip, op);
        return true;
      }
      case "effects": {
        const clip = find(op.id);
        if (!clip || (clip.kind !== "image" && clip.kind !== "video")) return false;
        s.patchClip(clip.id, { effects: effectsPatch(op, clip.effects) });
        return true;
      }
      case "crop": {
        const clip = find(op.id);
        if (!clip || (clip.kind !== "image" && clip.kind !== "video")) return false;
        const c = clip.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
        const edge = (k: "left" | "top" | "right" | "bottom") => clamp(num(op[k]) ?? c[k], 0, 0.9);
        s.patchClip(clip.id, { crop: { left: edge("left"), top: edge("top"), right: edge("right"), bottom: edge("bottom") } });
        return true;
      }
      case "style": {
        const clip = find(op.id);
        if (!clip) return false;
        const patch: Partial<MediaClip> = {};
        const r = num(op.radius);
        if (r !== undefined && clip.kind !== "text") patch.radius = clamp(r, 0, 540);
        const sh = bool(op.shadow);
        if (sh !== undefined) patch.shadow = sh ? { color: "#000000", opacity: 0.5, blur: 24, offsetX: 0, offsetY: 12 } : null;
        s.patchClip(clip.id, patch);
        return true;
      }
      case "animate": {
        const clip = find(op.id);
        if (!clip) return false;
        const anim = (v: unknown) =>
          v === "none" ? null : ANIMATIONS.includes(v as ClipAnimationKind) ? { kind: v as ClipAnimationKind, duration: 0.5 } : undefined;
        const patch: Partial<Clip> = {};
        const a = anim(op.in);
        const b = anim(op.out);
        if (a !== undefined) patch.animateIn = a ?? undefined;
        if (b !== undefined) patch.animateOut = b ?? undefined;
        s.patchClip(clip.id, patch);
        return true;
      }
      case "timing": {
        const clip = find(op.id);
        if (!clip) return false;
        const start = num(op.start);
        const duration = num(op.duration);
        if (start !== undefined) s.moveClip(clip.id, { start: Math.max(0, start) });
        if (duration !== undefined) {
          const cur = store().clips.find((c) => c.id === clip.id);
          if (cur) s.trimClip(clip.id, "out", clamp(duration, 0.1, 3600) - cur.duration);
        }
        return true;
      }
      case "audio": {
        const clip = find(op.id);
        if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return false;
        const patch: Partial<MediaClip> = {};
        const vol = num(op.volume);
        if (vol !== undefined) patch.audio = { ...clip.audio, volume: clamp(vol, 0, 2) };
        const speed = num(op.speed);
        if (speed !== undefined) patch.speed = clamp(speed, 0.25, 4);
        s.patchClip(clip.id, patch);
        return true;
      }
      case "order": {
        const clip = find(op.id);
        const dir = op.direction;
        if (!clip || (dir !== "front" && dir !== "back" && dir !== "forward" && dir !== "backward")) return false;
        s.moveTrack(clip.trackId, dir);
        return true;
      }
      case "duplicate": {
        const clip = find(op.id);
        if (!clip) return false;
        s.selectClip(clip.id);
        s.duplicateOnCanvas();
        const copy = store().selectedClipIds[0];
        if (copy) created.push(copy);
        return true;
      }
      case "delete": {
        const clip = find(op.id);
        if (!clip) return false;
        s.rippleDelete([clip.id]);
        return true;
      }
      case "select": {
        const clip = find(op.id);
        if (!clip) return false;
        s.selectClip(clip.id);
        return true;
      }
      case "add_media": {
        const mediaId = str(op.mediaId);
        const media = mediaId ? s.media.find((m) => m.id === mediaId) : undefined;
        if (!media) return false;
        const id = s.addClipFromMedia(media.id, undefined, undefined, { layer: media.kind === "image" });
        if (!id) return false;
        created.push(id);
        const clip = store().clips.find((c) => c.id === id);
        if (clip) place(clip, op);
        return true;
      }
      case "add_stock": {
        const kind = op.kind === "video" || op.kind === "audio" ? op.kind : "photo";
        const query = str(op.query) ?? "";
        const orientation = (["landscape", "portrait", "square"].includes(op.orientation as string)
          ? op.orientation : "all") as FreeAssetOrientation;
        // Loosen the search step by step rather than give up: shape filter off,
        // then just the first two words of the query.
        const short = query.split(/s+/).slice(0, 2).join(" ");
        const attempts: [string, FreeAssetOrientation][] = [[query, orientation], [query, "all"], [short, "all"]];
        let asset: Awaited<ReturnType<typeof searchFreeAssets>>["items"][number] | undefined;
        for (const [q, o] of attempts) {
          try {
            asset = pickStock((await searchFreeAssets({ kind, query: q, page: 1, orientation: o })).items, kind);
          } catch {
            asset = undefined;
          }
          if (asset) break;
        }
        if (!asset) {
          report.missingStock.push(query);
          return false;
        }
        const file = await downloadFreeAsset(asset);
        const mediaId = await importOneFile(file, { wallet: ctx.wallet, provenance: provenanceForAsset(asset) });
        if (!mediaId) return false;
        const id = store().addClipFromMedia(mediaId, undefined, undefined, { layer: kind === "photo" });
        if (!id) return false;
        created.push(id);
        const clip = store().clips.find((c) => c.id === id);
        if (clip && kind !== "audio") place(clip, op);
        return true;
      }
      case "apply_brand": {
        if (!hasBrand(useBrandStore.getState().kit)) return false;
        return (await applyBrand()) > 0;
      }
      case "add_logo": {
        return !!addBrandLogo();
      }
      case "add_page": {
        s.addPage({ duplicate: bool(op.duplicate) === true });
        return true;
      }
      case "goto_page": {
        const pages = getPages(s.settings, s.clips);
        const idx = num(op.index);
        const page = idx !== undefined ? pages[Math.round(idx)] : undefined;
        if (!page) return false;
        s.setCurrentTime(page.start);
        return true;
      }
      case "use_template": {
        // Loaded lazily: templates import this module, so a static import would be circular.
        const { TEMPLATES } = await import("./templates");
        const tpl = TEMPLATES.find((x) => x.id === op.template);
        if (!tpl) return false;
        const { default: i18n } = await import("@/i18n");
        const all = store().clips.map((c) => c.id);
        if (all.length) store().rippleDelete(all);
        store().setCurrentTime(0);
        // Nested ops run inside this request's undo step; their new layers
        // are not addressable as new:N from the outer list.
        const inner = await applyOps(tpl.ops(i18n.t.bind(i18n)), ctx);
        return inner.applied > 0;
      }
      case "captions": {
        const clip = find(op.id) ?? store().clips.find((c) => c.kind === "video" || c.kind === "audio");
        if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return false;
        return await useCaptionsStore.getState().run(clip.id);
      }
      case "remove_background": {
        const clip = find(op.id);
        if (!clip || clip.kind !== "image") return false;
        return await useBgRemovalStore.getState().run(clip.id, ctx.wallet);
      }
      case "generate": {
        const prompt = str(op.prompt);
        if (!prompt) return false;
        const kind = op.kind === "video" ? "video" : "image";
        const aspect = s.settings.aspectPreset !== "custom" ? s.settings.aspectPreset : undefined;
        useEditorUiStore.getState().setGeneratePrefill({ kind, prompt, aspect });
        report.generate = { kind, prompt };
        return true;
      }
      default:
        return false;
    }
  }
}
