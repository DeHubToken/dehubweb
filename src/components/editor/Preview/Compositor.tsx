/**
 * Canvas-based preview compositor. Composites all active clips at the playhead
 * (video frames + images + text overlays) and synchronises audio elements.
 *
 * Every visual layer — image, video or text — can be picked on the canvas and
 * moved, resized and rotated directly, with snapping guides to the page and to
 * other layers. Drawing goes through lib/editor/render so the preview and every
 * export stay pixel-identical.
 *
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Play, Pause, Repeat, Type, RotateCcw, RotateCw, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown,
  Copy, Trash2, Pencil, Scissors, FlipHorizontal2, FlipVertical2, Maximize, Minimize, Crosshair, PanelBottomClose, PanelBottomOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import type { Clip, MediaClip, TextClip } from "@/lib/editor/types";
import { computeRenderOps, type RenderOp } from "@/lib/editor/transitions";
import { clipBox, drawClip, getTransform, isVisualClip, placementPatch, pointInBox, type ClipBox } from "@/lib/editor/render";
import { useCloseOnSurfaceSwitch } from "@/hooks/use-surface-switch";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { importFiles } from "@/lib/editor/importFiles";
import { TEXT_DRAG_MIME, type TextPreset } from "@/lib/editor/textPresets";
import { useBgRemovalStore } from "@/store/editorBgRemovalStore";
import { PagesStrip } from "./PagesStrip";

const MEDIA_DRAG_MIME = "application/x-dehub-media";
/** Snap distance in screen pixels. */
const SNAP_PX = 6;

function fmtTime(t: number, fps: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const total = Math.floor(t);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const f = Math.floor((t - total) * fps);
  return `${m}:${s.toString().padStart(2, "0")}.${f.toString().padStart(2, "0")}`;
}

function sameBox(a: ClipBox | null, b: ClipBox | null) {
  if (!a || !b) return a === b;
  return Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.w - b.w) < 0.5
    && Math.abs(a.h - b.h) < 0.5 && Math.abs(a.rotation - b.rotation) < 0.05;
}

/** Axis-aligned half extents of a rotated box. */
function halfExtents(b: ClipBox) {
  const r = (b.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { hw: (b.w * c + b.h * s) / 2, hh: (b.w * s + b.h * c) / 2 };
}

type Gesture =
  | {
      mode: "move"; id: string; px: number; py: number; box: ClipBox; ax: number; ay: number;
      /** Other selected layers that travel with this one. */
      group: { id: string; ax: number; ay: number }[];
    }
  | { mode: "marquee"; x0: number; y0: number; additive: boolean }
  | { mode: "scale"; id: string; box: ClipBox; dist: number; scale: number; font: number }
  | { mode: "rotate"; id: string; box: ClipBox; angle: number; rotation: number }
  | { mode: "stretch"; id: string; box: ClipBox; axis: "x" | "y"; scale: number };

export function Compositor() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const tracks = useEditorStore((s) => s.tracks);
  const clips = useEditorStore((s) => s.clips);
  const media = useEditorStore((s) => s.media);
  const settings = useEditorStore((s) => s.settings);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const isLooping = useEditorStore((s) => s.isLooping);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectClip = useEditorStore((s) => s.selectClip);
  const updateTextClip = useEditorStore((s) => s.updateTextClip);
  const duration = useEditorStore(selectTimelineDuration);
  const timelineOpen = useEditorUiStore((s) => s.timelineOpen);
  const setTimelineOpen = useEditorUiStore((s) => s.setTimelineOpen);
  const setCanvasFocus = useEditorUiStore((s) => s.setCanvasFocus);
  const draw = useEditorUiStore((s) => s.draw);
  // Freehand stroke in progress, in canvas pixels (live preview only).
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const quota = useEditorQuota();

  // ── Element pools ──
  const videoPool = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioPool = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imagePool = useRef<Map<string, HTMLImageElement>>(new Map());
  const sources = useMemo(() => ({ videos: videoPool.current, images: imagePool.current }), []);

  // Provision elements when media changes.
  useEffect(() => {
    const vPool = videoPool.current;
    const aPool = audioPool.current;
    const iPool = imagePool.current;
    const liveIds = new Set(media.map((m) => m.id));

    for (const m of media) {
      if (m.kind === "video" && !vPool.has(m.id)) {
        const v = document.createElement("video");
        // Don't set crossOrigin on blob: URLs — it can prevent decoding in
        // some Chromium builds and blob: URLs are always same-origin.
        if (!m.url.startsWith("blob:")) v.crossOrigin = "anonymous";
        v.muted = true; // audio handled separately via audioPool when needed
        v.playsInline = true;
        v.preload = "auto";
        v.src = m.url;
        try { v.load(); } catch { /* noop */ }
        vPool.set(m.id, v);
      }
      if (m.kind === "audio" && !aPool.has(m.id)) {
        const a = new Audio(m.url);
        a.preload = "auto";
        aPool.set(m.id, a);
      }
      if (m.kind === "image" && !iPool.has(m.id)) {
        const img = new Image();
        if (!m.url.startsWith("blob:")) img.crossOrigin = "anonymous";
        img.src = m.url;
        iPool.set(m.id, img);
      }
    }
    // GC dropped media.
    for (const id of Array.from(vPool.keys())) if (!liveIds.has(id)) { vPool.get(id)?.pause(); vPool.delete(id); }
    for (const id of Array.from(aPool.keys())) if (!liveIds.has(id)) { aPool.get(id)?.pause(); aPool.delete(id); }
    for (const id of Array.from(iPool.keys())) if (!liveIds.has(id)) iPool.delete(id);
  }, [media]);

  // ── Playback clock ──
  const playStartedRef = useRef<{ wall: number; time: number } | null>(null);
  useEffect(() => {
    if (isPlaying) {
      playStartedRef.current = { wall: performance.now(), time: useEditorStore.getState().currentTime };
    } else {
      playStartedRef.current = null;
      // Pause any media playing.
      for (const v of videoPool.current.values()) v.pause();
      for (const a of audioPool.current.values()) a.pause();
    }
  }, [isPlaying]);

  // Selection box, refreshed from the render loop so it follows animations,
  // playback and late-decoding media without its own timers.
  const [selBox, setSelBox] = useState<ClipBox | null>(null);
  const selBoxRef = useRef<ClipBox | null>(null);

  // ── Render loop ──
  useEffect(() => {
    let raf = 0;
    const trackZ = (trackId: string) => {
      const idx = tracks.findIndex((tr) => tr.id === trackId);
      return idx < 0 ? 0 : idx;
    };

    const tick = () => {
      // Advance playhead.
      const state = useEditorStore.getState();
      let time = state.currentTime;
      if (state.isPlaying && playStartedRef.current) {
        time = playStartedRef.current.time + (performance.now() - playStartedRef.current.wall) / 1000;
        const dur = selectTimelineDuration(state);
        if (dur > 0 && time >= dur) {
          if (state.isLooping) {
            playStartedRef.current = { wall: performance.now(), time: 0 };
            time = 0;
          } else {
            time = dur;
            state.setIsPlaying(false);
          }
        }
        state.setCurrentTime(time);
      }

      // Determine active clips (audio still uses simple active set; visuals use render-ops).
      const active = state.clips.filter((c) => time >= c.start && time < c.start + c.duration);

      // Compute visual render ops (covers normal + outgoing + incoming-preroll transitions).
      const isVisualTrack = (trackId: string) => {
        const tr = state.tracks.find((x) => x.id === trackId);
        return !!tr && !tr.hidden && tr.kind !== "audio";
      };
      const renderOps: RenderOp[] = computeRenderOps(
        state.clips,
        isVisualTrack,
        time,
        state.settings.width,
      );

      // Sync video/audio media.
      const activeVideoMediaIds = new Set<string>();
      const activeAudioMediaIds = new Set<string>();

      // Video sync uses render-ops so incoming pre-roll clips also seek to the right frame.
      for (const op of renderOps) {
        if (op.clip.kind !== "video") continue;
        const mc = op.clip as MediaClip;
        const v = videoPool.current.get(mc.mediaId);
        if (!v) continue;
        activeVideoMediaIds.add(mc.mediaId);
        const speed = mc.speed && mc.speed > 0 ? mc.speed : 1;
        const localT =
          op.localTimeOverride !== undefined ? op.localTimeOverride : mc.trimIn + (time - mc.start) * speed;
        if (state.isPlaying) {
          if (v.playbackRate !== speed) v.playbackRate = speed;
          if (Math.abs(v.currentTime - localT) > 0.25) v.currentTime = localT;
          if (v.paused) { void v.play().catch(() => undefined); }
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - localT) > 0.03) v.currentTime = localT;
        }
      }

      // Audio sync (no crossfade — hard cut at clip boundaries).
      for (const c of active) {
        if (c.kind !== "audio") continue;
        const mc = c as MediaClip;
        const speed = mc.speed && mc.speed > 0 ? mc.speed : 1;
        const localT = mc.trimIn + (time - mc.start) * speed;
        const a = audioPool.current.get(mc.mediaId);
        const track = state.tracks.find((tr) => tr.id === mc.trackId);
        if (!a) continue;
        activeAudioMediaIds.add(mc.mediaId);
        a.muted = !!track?.muted;
        a.volume = Math.max(0, Math.min(1, mc.audio?.volume ?? 1));
        if (state.isPlaying) {
          if (a.playbackRate !== speed) a.playbackRate = speed;
          if (Math.abs(a.currentTime - localT) > 0.25) a.currentTime = localT;
          if (a.paused) { void a.play().catch(() => undefined); }
        } else {
          if (!a.paused) a.pause();
          if (Math.abs(a.currentTime - localT) > 0.03) a.currentTime = localT;
        }
      }

      // Pause inactive videos/audios.
      for (const [id, v] of videoPool.current) {
        if (!activeVideoMediaIds.has(id) && !v.paused) v.pause();
      }
      for (const [id, a] of audioPool.current) {
        if (!activeAudioMediaIds.has(id) && !a.paused) a.pause();
      }

      // Draw to canvas.
      const canvas = canvasRef.current;
      if (canvas) {
        const W = state.settings.width;
        const H = state.settings.height;
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = state.settings.background;
          ctx.fillRect(0, 0, W, H);

          // Sort by track index then preserve op order (so incoming draws over outgoing where alpha overlaps).
          const ordered = renderOps.slice().sort(
            (a, b) => trackZ(a.clip.trackId) - trackZ(b.clip.trackId),
          );

          for (const op of ordered) {
            ctx.save();
            if (op.translateX) ctx.translate(op.translateX, 0);
            if (op.clipRect) {
              ctx.beginPath();
              ctx.rect(op.clipRect.x, 0, op.clipRect.w, H);
              ctx.clip();
            }
            ctx.globalAlpha = op.alpha;
            drawClip(ctx, W, H, op.clip, time, sources);
            ctx.restore();
          }

          // Keep the selection box in step with what was just drawn.
          const selId = state.selectedClipIds.length === 1 ? state.selectedClipIds[0] : null;
          const sel = selId ? state.clips.find((c) => c.id === selId) : null;
          const visible = sel && isVisualClip(sel) && !sel.hidden && time >= sel.start && time <= sel.start + sel.duration;
          const next = visible ? clipBox(ctx, sel, W, H, sources) : null;
          if (!sameBox(next, selBoxRef.current)) {
            selBoxRef.current = next;
            setSelBox(next);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracks, clips, settings, sources]);

  // ── Layout: scale canvas to fit (sync initial measurement + observer) ──
  const [scale, setScale] = useState(0);
  const PAD = 24;
  const retryRef = useRef<number | null>(null);

  /**
   * Returns true once a real box was measured.
   *
   * CreatorEditorHost preloads /editor while it is still hidden with
   * `display: none`, so the first measurement finds a 0x0 wrapper. Bailing out
   * left `scale` at 0 forever, and the stage rendered as a hidden 2x2 box: the
   * editor looked like it had no canvas at all. A ResizeObserver is not enough
   * on its own here, so a failed measurement keeps retrying each frame until
   * the element actually has a box.
   */
  const measure = useCallback((): boolean => {
    const wrap = wrapRef.current;
    if (!wrap) return false;
    const aw = Math.max(0, wrap.clientWidth - PAD * 2);
    const ah = Math.max(0, wrap.clientHeight - PAD * 2);
    if (aw <= 0 || ah <= 0) return false;
    const s = Math.min(aw / settings.width, ah / settings.height);
    setScale(Math.max(0.01, s));
    return true;
  }, [settings.width, settings.height]);

  const measureWhenVisible = useCallback(() => {
    if (retryRef.current !== null) {
      cancelAnimationFrame(retryRef.current);
      retryRef.current = null;
    }
    // Bounded: while the editor is preloaded behind `display: none` the wrapper
    // has no box and every attempt fails, so an unbounded loop would run for
    // the whole session. A short burst covers the normal "one frame late" case;
    // beyond that the ResizeObserver and the surface-switch hook take over,
    // both of which fire exactly when a box appears.
    let attemptsLeft = 30;
    const attempt = () => {
      if (measure() || attemptsLeft-- <= 0) {
        retryRef.current = null;
        return;
      }
      retryRef.current = requestAnimationFrame(attempt);
    };
    attempt();
  }, [measure]);

  useLayoutEffect(() => {
    measureWhenVisible();
    return () => {
      if (retryRef.current !== null) cancelAnimationFrame(retryRef.current);
      retryRef.current = null;
    };
  }, [measureWhenVisible]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onChange = () => measure();
    const ro = new ResizeObserver(onChange);
    ro.observe(wrap);
    window.addEventListener("resize", onChange);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onChange);
    };
  }, [measure]);

  // The host reveals this surface by removing `display: none`, which does not
  // reliably wake the ResizeObserver, so re-measure on every switch.
  useCloseOnSurfaceSwitch(measureWhenVisible);

  // Arrow keys nudge the selection only while the canvas is the last thing
  // clicked; anywhere else they keep scrubbing the playhead.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const inside = !!surfaceRef.current && surfaceRef.current.contains(e.target as Node);
      setCanvasFocus(inside);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [setCanvasFocus]);

  // ── Canvas interactions ──
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * settings.width,
      y: ((clientY - rect.top) / rect.height) * settings.height,
    };
  }, [settings.width, settings.height]);

  /** Visible layers at the playhead, bottom to top, with their boxes. */
  const layersAt = useCallback((): { clip: Clip; box: ClipBox }[] => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return [];
    const s = useEditorStore.getState();
    const now = s.currentTime;
    const hidden = new Set(s.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
    const z = (id: string) => s.tracks.findIndex((tr) => tr.id === id);
    return s.clips
      // Hidden and locked layers are not pickable on the canvas; the Layers panel still reaches them.
      .filter((c) => isVisualClip(c) && !c.hidden && !c.locked && !hidden.has(c.trackId) && now >= c.start && now <= c.start + c.duration)
      .sort((a, b) => z(a.trackId) - z(b.trackId))
      .map((clip) => ({ clip, box: clipBox(ctx, clip, s.settings.width, s.settings.height, sources) }))
      .filter((l): l is { clip: Clip; box: ClipBox } => !!l.box);
  }, [sources]);

  const hitTest = useCallback((clientX: number, clientY: number): { clip: Clip; box: ClipBox } | null => {
    const p = toCanvas(clientX, clientY);
    const layers = layersAt();
    // The current selection wins while the pointer is inside it, so a selected
    // layer can be dragged even when something else sits on top of it.
    const selId = useEditorStore.getState().selectedClipIds[0];
    const sel = layers.find((l) => l.clip.id === selId);
    if (sel && pointInBox(sel.box, p.x, p.y)) return sel;
    for (let i = layers.length - 1; i >= 0; i--) {
      if (pointInBox(layers[i].box, p.x, p.y)) return layers[i];
    }
    return null;
  }, [toCanvas, layersAt]);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const editingText = useMemo(() => {
    if (!editingTextId) return null;
    const c = clips.find((x) => x.id === editingTextId);
    return c && c.kind === "text" ? (c as TextClip) : null;
  }, [editingTextId, clips]);

  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    const c = clips.find((x) => x.id === selectedClipIds[0]);
    return c && isVisualClip(c) ? c : null;
  }, [selectedClipIds, clips]);

  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // Drag-to-select rectangle, in canvas pixels.
  const [marquee, setMarqueeState] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const setMarquee = useCallback((m: typeof marquee) => {
    marqueeRef.current = m;
    setMarqueeState(m);
  }, []);
  const gestureRef = useRef<Gesture | null>(null);

  const onGestureMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const s = useEditorStore.getState();
    const W = s.settings.width;
    const H = s.settings.height;
    const p = toCanvas(e.clientX, e.clientY);

    if (g.mode === "marquee") {
      setMarquee({ x: Math.min(g.x0, p.x), y: Math.min(g.y0, p.y), w: Math.abs(p.x - g.x0), h: Math.abs(p.y - g.y0) });
      return;
    }

    const clip = s.clips.find((c) => c.id === g.id);
    if (!clip) return;

    if (g.mode === "move") {
      let cx = g.box.cx + (p.x - g.px);
      let cy = g.box.cy + (p.y - g.py);
      const snapDist = SNAP_PX / Math.max(0.01, scale);
      const { hw, hh } = halfExtents(g.box);
      const moving = new Set([g.id, ...g.group.map((m) => m.id)]);
      const others = layersAt().filter((l) => !moving.has(l.clip.id));
      const xs = [0, W / 2, W];
      const ys = [0, H / 2, H];
      for (const o of others) {
        const e2 = halfExtents(o.box);
        xs.push(o.box.cx - e2.hw, o.box.cx, o.box.cx + e2.hw);
        ys.push(o.box.cy - e2.hh, o.box.cy, o.box.cy + e2.hh);
      }
      const snap = (centre: number, half: number, lines: number[]) => {
        let best: { d: number; line: number; shift: number } | null = null;
        for (const edge of [centre - half, centre, centre + half]) {
          for (const line of lines) {
            const d = Math.abs(edge - line);
            if (d <= snapDist && (!best || d < best.d)) best = { d, line, shift: line - edge };
          }
        }
        return best;
      };
      const sx = e.altKey ? null : snap(cx, hw, xs);
      const sy = e.altKey ? null : snap(cy, hh, ys);
      if (sx) cx += sx.shift;
      if (sy) cy += sy.shift;
      setGuides({ v: sx ? [sx.line] : [], h: sy ? [sy.line] : [] });
      const dx = (cx - g.box.cx) / W;
      const dy = (cy - g.box.cy) / H;
      s.patchClipLive(g.id, placementPatch(clip, { x: g.ax + dx, y: g.ay + dy }));
      for (const m of g.group) {
        const other = s.clips.find((c) => c.id === m.id);
        if (other) s.patchClipLive(m.id, placementPatch(other, { x: m.ax + dx, y: m.ay + dy }));
      }
      return;
    }

    if (g.mode === "scale") {
      const dist = Math.hypot(p.x - g.box.cx, p.y - g.box.cy);
      const k = dist / Math.max(1, g.dist);
      if (clip.kind === "text") {
        s.patchClipLive(g.id, { fontSize: Math.round(Math.max(6, Math.min(800, g.font * k))) });
      } else {
        s.patchClipLive(g.id, placementPatch(clip, { scale: Math.max(0.05, Math.min(20, g.scale * k)) }));
      }
      return;
    }

    if (g.mode === "stretch") {
      if (clip.kind !== "shape") return;
      // Distance from the centre along the box's own axis, so a rotated shape
      // stretches along its edge rather than the screen axis.
      const rad = (-g.box.rotation * Math.PI) / 180;
      const dx = p.x - g.box.cx;
      const dy = p.y - g.box.cy;
      const local = g.axis === "x" ? dx * Math.cos(rad) - dy * Math.sin(rad) : dx * Math.sin(rad) + dy * Math.cos(rad);
      const size = Math.max(4, Math.abs(local) * 2) / (g.axis === "x" ? W : H) / Math.max(0.01, g.scale);
      s.patchClipLive(g.id, g.axis === "x" ? { w: size } : { h: size });
      return;
    }

    // rotate
    const angle = (Math.atan2(p.y - g.box.cy, p.x - g.box.cx) * 180) / Math.PI;
    let rot = g.rotation + (angle - g.angle);
    rot = ((rot + 540) % 360) - 180;
    if (e.shiftKey) rot = Math.round(rot / 15) * 15;
    else {
      const nearest = Math.round(rot / 45) * 45;
      if (Math.abs(rot - nearest) < 4) rot = nearest;
    }
    s.patchClipLive(g.id, placementPatch(clip, { rotation: Math.round(rot * 10) / 10 }));
  }, [toCanvas, layersAt, scale, setMarquee]);

  const onGestureEnd = useCallback(() => {
    const g = gestureRef.current;
    if (g?.mode === "marquee") {
      const m = marqueeRef.current;
      if (m && (m.w > 4 || m.h > 4)) {
        const hits = layersAt()
          .filter(({ box }) => {
            const { hw, hh } = halfExtents(box);
            return box.cx + hw >= m.x && box.cx - hw <= m.x + m.w && box.cy + hh >= m.y && box.cy - hh <= m.y + m.h;
          })
          .map((l) => l.clip.id);
        const prev = g.additive ? useEditorStore.getState().selectedClipIds : [];
        useEditorStore.getState().selectMany([...new Set([...prev, ...hits])]);
      }
      setMarquee(null);
    }
    gestureRef.current = null;
    setGuides({ v: [], h: [] });
    window.removeEventListener("pointermove", onGestureMove);
    window.removeEventListener("pointerup", onGestureEnd);
    window.removeEventListener("pointercancel", onGestureEnd);
  }, [onGestureMove, layersAt, setMarquee]);

  const startGesture = useCallback((g: Gesture) => {
    useEditorStore.getState().beginGesture();
    gestureRef.current = g;
    window.addEventListener("pointermove", onGestureMove);
    window.addEventListener("pointerup", onGestureEnd);
    window.addEventListener("pointercancel", onGestureEnd);
  }, [onGestureMove, onGestureEnd]);

  useEffect(() => () => onGestureEnd(), [onGestureEnd]);

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>, pen: { color: string; width: number }) => {
    const pts: [number, number][] = [];
    const push = (clientX: number, clientY: number) => {
      const p = toCanvas(clientX, clientY);
      const last = pts[pts.length - 1];
      // Skip samples closer than 2 canvas px: smoother curve, smaller layer.
      if (!last || Math.hypot(p.x - last[0], p.y - last[1]) >= 2) pts.push([p.x, p.y]);
    };
    push(e.clientX, e.clientY);
    setStroke([...pts]);
    const onMove = (ev: PointerEvent) => {
      push(ev.clientX, ev.clientY);
      setStroke([...pts]);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setStroke(null);
      if (!pts.length) return;
      const s = useEditorStore.getState();
      const W = s.settings.width;
      const H = s.settings.height;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      // Give a straight or tiny stroke a real box so its points stay finite.
      const w = Math.max(maxX - minX, 4);
      const h = Math.max(maxY - minY, 4);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      s.addShapeClip("path", {
        fill: null,
        stroke: { color: pen.color, width: pen.width },
        w: w / W,
        h: h / H,
        points: pts.map(([x, y]) => [(x - cx) / w, (y - cy) / h] as [number, number]),
        transform: { x: cx / W, y: cy / H, scale: 1, rotation: 0 },
      });
      // Keep drawing: no selection box getting in the way of the next stroke.
      useEditorStore.getState().selectClip(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingTextId) return;
    if (e.button !== 0) return;
    if (draw) {
      startStroke(e, draw);
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    const p = toCanvas(e.clientX, e.clientY);
    if (!hit) {
      // Drag on empty canvas draws a selection box; a plain click clears.
      if (!e.shiftKey) selectClip(null);
      gestureRef.current = { mode: "marquee", x0: p.x, y0: p.y, additive: e.shiftKey };
      window.addEventListener("pointermove", onGestureMove);
      window.addEventListener("pointerup", onGestureEnd);
      window.addEventListener("pointercancel", onGestureEnd);
      return;
    }
    if (e.shiftKey) { selectClip(hit.clip.id, true); return; }
    // Grabbing a layer that is part of a multi-selection moves the whole group.
    const inGroup = selectedClipIds.length > 1 && selectedClipIds.includes(hit.clip.id);
    if (!inGroup && (selectedClipIds[0] !== hit.clip.id || selectedClipIds.length !== 1)) selectClip(hit.clip.id);
    const tr = getTransform(hit.clip);
    const all = useEditorStore.getState().clips;
    const group = inGroup
      ? selectedClipIds
          .filter((id) => id !== hit.clip.id)
          .map((id) => all.find((c) => c.id === id))
          .filter((c): c is Clip => !!c && isVisualClip(c) && !c.locked)
          .map((c) => ({ id: c.id, ax: getTransform(c).x, ay: getTransform(c).y }))
      : [];
    startGesture({ mode: "move", id: hit.clip.id, px: p.x, py: p.y, box: hit.box, ax: tr.x, ay: tr.y, group });
  };

  const onHandleDown = (mode: "scale" | "rotate" | "stretch-x" | "stretch-y") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedClip || !selBox) return;
    const p = toCanvas(e.clientX, e.clientY);
    const tr = getTransform(selectedClip);
    if (mode === "stretch-x" || mode === "stretch-y") {
      startGesture({ mode: "stretch", id: selectedClip.id, box: selBox, axis: mode === "stretch-x" ? "x" : "y", scale: tr.scale });
    } else if (mode === "scale") {
      startGesture({
        mode, id: selectedClip.id, box: selBox,
        dist: Math.hypot(p.x - selBox.cx, p.y - selBox.cy),
        scale: tr.scale,
        font: selectedClip.kind === "text" ? selectedClip.fontSize : 0,
      });
    } else {
      startGesture({
        mode, id: selectedClip.id, box: selBox,
        angle: (Math.atan2(p.y - selBox.cy, p.x - selBox.cx) * 180) / Math.PI,
        rotation: tr.rotation,
      });
    }
  };

  const onCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit && hit.clip.kind === "text") {
      selectClip(hit.clip.id);
      setEditingTextId(hit.clip.id);
    } else if (hit) {
      selectClip(hit.clip.id);
      window.dispatchEvent(new Event("editor:open-inspector"));
    }
  };
  const onCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) selectClip(hit.clip.id);
    else selectClip(null);
  };

  // ── Drop onto the canvas: text presets, library media, files from the computer ──
  const [dropKind, setDropKind] = useState<"text" | "media" | null>(null);
  const onSurfaceDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    const kind = types.includes(TEXT_DRAG_MIME)
      ? "text"
      : types.includes(MEDIA_DRAG_MIME) || types.includes("Files")
        ? "media"
        : null;
    if (!kind) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropKind(kind);
  };
  const onSurfaceDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropKind(null);
  };

  /** Put a freshly added media clip where it was dropped. */
  const placeAt = (clipId: string | null, nx: number, ny: number) => {
    if (!clipId) return;
    const s = useEditorStore.getState();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip || clip.kind === "audio") return;
    s.patchClipLive(clipId, placementPatch(clip, { x: nx, y: ny, scale: s.clips.length > 1 ? 0.6 : 1 }));
  };

  const onSurfaceDrop = (e: React.DragEvent) => {
    setDropKind(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const textRaw = e.dataTransfer.getData(TEXT_DRAG_MIME);
    if (textRaw) {
      e.preventDefault();
      let preset: TextPreset | null = null;
      try { preset = JSON.parse(textRaw) as TextPreset; } catch { /* noop */ }
      const id = addTextClip();
      updateTextClip(id, {
        x: nx,
        y: ny,
        ...(preset ? { text: preset.text, fontSize: preset.fontSize, fontWeight: preset.fontWeight } : {}),
      });
      return;
    }

    const mediaRaw = e.dataTransfer.getData(MEDIA_DRAG_MIME);
    if (mediaRaw) {
      e.preventDefault();
      try {
        const parsed = JSON.parse(mediaRaw) as { mediaId?: unknown };
        if (typeof parsed.mediaId === "string") placeAt(addClipFromMedia(parsed.mediaId), nx, ny);
      } catch { /* noop */ }
      return;
    }

    if (e.dataTransfer.files?.length) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      void importFiles(files, { wallet: quota.walletAddress }).then((ids) => {
        ids.forEach((id, i) => placeAt(addClipFromMedia(id), Math.min(1, nx + i * 0.03), Math.min(1, ny + i * 0.03)));
      });
    }
  };

  // Display-space geometry for the selection overlay.
  // Dashed outline around a multi-selection (axis-aligned bounds of every member).
  const groupBounds = (() => {
    if (selectedClipIds.length < 2 || scale <= 0) return null;
    const boxes = layersAt().filter((l) => selectedClipIds.includes(l.clip.id)).map((l) => l.box);
    if (boxes.length < 2) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
      const { hw, hh } = halfExtents(b);
      x0 = Math.min(x0, b.cx - hw); y0 = Math.min(y0, b.cy - hh);
      x1 = Math.max(x1, b.cx + hw); y1 = Math.max(y1, b.cy + hh);
    }
    return { left: x0 * scale, top: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale };
  })();

  const overlay = selBox && selectedClip && !selectedClip.locked && !editingTextId && scale > 0
    ? {
        left: (selBox.cx - selBox.w / 2) * scale,
        top: (selBox.cy - selBox.h / 2) * scale,
        width: selBox.w * scale,
        height: selBox.h * scale,
        rotation: selBox.rotation,
      }
    : null;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-black">
      <div
        ref={wrapRef}
        onDragOver={onSurfaceDragOver}
        onDragLeave={onSurfaceDragLeave}
        onDrop={onSurfaceDrop}
        className="relative grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.04),_transparent_70%)] p-6"
      >
        <div
          ref={surfaceRef}
          style={{
            width: Math.max(2, settings.width * scale),
            height: Math.max(2, settings.height * scale),
            background: settings.background,
            visibility: scale > 0 ? "visible" : "hidden",
            margin: "auto",
          }}
          className={cn(
            "relative col-start-1 row-start-1 rounded-lg shadow-2xl ring-1 ring-white/10 transition",
            dropKind && "ring-2 ring-white/70",
          )}
        >
          <div className="absolute inset-0 overflow-hidden rounded-lg">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <canvas
                  ref={canvasRef}
                  width={settings.width}
                  height={settings.height}
                  onPointerDown={onCanvasPointerDown}
                  onDoubleClick={onCanvasDoubleClick}
                  onContextMenu={onCanvasContextMenu}
                  className={cn(
                    "h-full w-full touch-none",
                    draw ? "cursor-crosshair" : editingTextId ? "cursor-text" : selectedClip ? "cursor-move" : "cursor-default",
                  )}
                />
              </ContextMenuTrigger>
              <CanvasContextMenu clip={selectedClip} onEdit={(id) => setEditingTextId(id)} />
            </ContextMenu>
          </div>

          {groupBounds && (
            <div className="pointer-events-none absolute rounded-[2px] border-2 border-dashed border-white/90"
              style={groupBounds} />
          )}
          {marquee && (
            <div className="pointer-events-none absolute border border-sky-300 bg-sky-300/10"
              style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale }} />
          )}

          {stroke && draw && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <polyline
                points={stroke.map(([x, y]) => `${x * scale},${y * scale}`).join(" ")}
                fill="none"
                stroke={draw.color}
                strokeWidth={Math.max(1, (draw.width / 1080) * settings.height * scale)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* Snapping guides */}
          {guides.v.map((x) => (
            <div key={`v${x}`} className="pointer-events-none absolute top-0 bottom-0 w-px bg-fuchsia-400"
              style={{ left: x * scale }} />
          ))}
          {guides.h.map((y) => (
            <div key={`h${y}`} className="pointer-events-none absolute left-0 right-0 h-px bg-fuchsia-400"
              style={{ top: y * scale }} />
          ))}

          {/* Selection box with resize and rotate handles. It may extend past
              the page edge, which is why the surface itself does not clip. */}
          {overlay && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: overlay.left,
                top: overlay.top,
                width: overlay.width,
                height: overlay.height,
                transform: `rotate(${overlay.rotation}deg)`,
              }}
            >
              <div className="absolute inset-0 rounded-[2px] ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={t("editor.canvas.resize")}
                  onPointerDown={onHandleDown("scale")}
                  className={cn(
                    "pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none",
                    "after:absolute after:left-1/2 after:top-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:-translate-y-1/2",
                    "after:rounded-full after:border after:border-black/40 after:bg-white after:shadow",
                    corner === "nw" && "left-0 top-0 cursor-nwse-resize",
                    corner === "ne" && "left-full top-0 cursor-nesw-resize",
                    corner === "sw" && "left-0 top-full cursor-nesw-resize",
                    corner === "se" && "left-full top-full cursor-nwse-resize",
                  )}
                />
              ))}
              {selectedClip?.kind === "shape" && (["e", "w", "n", "s"] as const).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  aria-label={t("editor.canvas.resize")}
                  onPointerDown={onHandleDown(edge === "e" || edge === "w" ? "stretch-x" : "stretch-y")}
                  className={cn(
                    "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 touch-none",
                    "after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2",
                    "after:rounded-full after:border after:border-black/40 after:bg-white after:shadow",
                    edge === "e" || edge === "w"
                      ? "h-6 w-4 top-1/2 cursor-ew-resize after:h-4 after:w-1.5"
                      : "h-4 w-6 left-1/2 cursor-ns-resize after:h-1.5 after:w-4",
                    edge === "e" && "left-full",
                    edge === "w" && "left-0",
                    edge === "n" && "top-0",
                    edge === "s" && "top-full",
                  )}
                />
              ))}
              <button
                type="button"
                aria-label={t("editor.canvas.rotate")}
                onPointerDown={onHandleDown("rotate")}
                className="pointer-events-auto absolute left-1/2 top-full mt-3 flex h-6 w-6 -translate-x-1/2 touch-none cursor-grab items-center justify-center rounded-full border border-black/40 bg-white text-black shadow active:cursor-grabbing"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {dropKind && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/[0.03]">
              <div className="rounded-lg border border-dashed border-white/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-white/90 backdrop-blur-[8px]">
                {dropKind === "text" ? t("editor.canvas.dropText") : t("editor.canvas.dropMedia")}
              </div>
            </div>
          )}
          {editingText && (
            <textarea
              autoFocus
              value={editingText.text}
              onChange={(e) => updateTextClip(editingText.id, { text: e.target.value })}
              onBlur={() => setEditingTextId(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setEditingTextId(null); }
              }}
              style={{
                position: "absolute",
                left: `${editingText.x * 100}%`,
                top: `${editingText.y * 100}%`,
                transform: editingText.align === "centre"
                  ? "translate(-50%, -50%)"
                  : editingText.align === "right"
                    ? "translate(-100%, -50%)"
                    : "translate(0, -50%)",
                color: editingText.color,
                fontFamily: editingText.fontFamily,
                fontWeight: editingText.fontWeight,
                fontStyle: editingText.italic ? "italic" : "normal",
                fontSize: `${(editingText.fontSize / 1080) * settings.height * scale}px`,
                textAlign: editingText.align === "centre" ? "center" : editingText.align,
                background: "transparent",
                border: "1px dashed rgba(255,255,255,0.6)",
                borderRadius: 4,
                padding: "2px 6px",
                outline: "none",
                resize: "none",
                minWidth: 80,
                lineHeight: editingText.lineHeight ?? 1.2,
                caretColor: "#fff",
              }}
              rows={Math.max(1, editingText.text.split("\n").length)}
            />
          )}
        </div>
      </div>


      <PagesStrip sources={sources} />

      <div className="flex min-w-0 items-center gap-3 border-t border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-[24px]">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            if (duration <= 0) return;
            if (currentTime >= duration - 0.05) setCurrentTime(0);
            setIsPlaying(!isPlaying);
          }}
          className="h-8 w-8 rounded-md text-white hover:bg-white/10"
          aria-label={isPlaying ? t("editor.canvas.pause") : t("editor.canvas.play")}
          disabled={duration <= 0}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => { setIsPlaying(false); setCurrentTime(0); }}
          className="h-8 w-8 rounded-md text-white/80 hover:bg-white/10"
          aria-label={t("editor.canvas.resetToStart")}
          disabled={duration <= 0}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleLoop}
          className={cn(
            "h-8 w-8 rounded-md hover:bg-white/10",
            isLooping ? "text-white" : "text-white/50",
          )}
          aria-label={t("editor.canvas.toggleLoop")}
        >
          <Repeat className="h-4 w-4" />
        </Button>
        <span className="hidden w-32 text-xs tabular-nums text-white/70 sm:inline">
          {fmtTime(currentTime, settings.fps)} / {fmtTime(duration, settings.fps)}
        </span>
        <Slider
          value={[Math.min(currentTime, duration || 0)]}
          min={0}
          max={Math.max(duration, 0.01)}
          step={1 / settings.fps}
          onValueChange={(v) => { setIsPlaying(false); setCurrentTime(v[0] ?? 0); }}
          className="min-w-0 flex-1"
          disabled={duration <= 0}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setTimelineOpen(!timelineOpen)}
          className="h-8 w-8 rounded-md text-white/80 hover:bg-white/10"
          aria-label={timelineOpen ? t("editor.canvas.hideTimeline") : t("editor.canvas.showTimeline")}
          title={timelineOpen ? t("editor.canvas.hideTimeline") : t("editor.canvas.showTimeline")}
        >
          {timelineOpen ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}

function CanvasContextMenu({
  clip,
  onEdit,
}: {
  clip: Clip | null;
  onEdit: (id: string) => void;
}) {
  const { t } = useTranslation();
  const moveTrack = useEditorStore((s) => s.moveTrack);
  const duplicateOnCanvas = useEditorStore((s) => s.duplicateOnCanvas);
  const rippleDelete = useEditorStore((s) => s.rippleDelete);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const patchClip = useEditorStore((s) => s.patchClip);
  const tracks = useEditorStore((s) => s.tracks);
  const bgBusy = useBgRemovalStore((s) => !!s.clipId);
  const runBgRemoval = useBgRemovalStore((s) => s.run);
  const quota = useEditorQuota();
  const menuClass = "w-56 border-white/10 bg-black/85 text-white backdrop-blur-[24px]";

  if (!clip) {
    return (
      <ContextMenuContent className={menuClass}>
        <ContextMenuItem onSelect={() => addTextClip()}>
          <Type className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.addText")}
        </ContextMenuItem>
      </ContextMenuContent>
    );
  }

  const idx = tracks.findIndex((tr) => tr.id === clip.trackId);
  const canForward = idx >= 0 && idx < tracks.length - 1;
  const canBackward = idx > 0;
  const tr = getTransform(clip);
  const mediaClip = clip.kind === "image" || clip.kind === "video" ? clip : null;

  return (
    <ContextMenuContent className={menuClass}>
      {clip.kind === "text" && (
        <>
          <ContextMenuItem onSelect={() => onEdit(clip.id)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.editText")}
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-white/10" />
        </>
      )}
      {mediaClip?.kind === "image" && (
        <ContextMenuItem disabled={bgBusy} onSelect={() => void runBgRemoval(clip.id, quota.walletAddress)}>
          <Scissors className="mr-2 h-3.5 w-3.5" /> {t("editor.bgRemove.action")}
        </ContextMenuItem>
      )}
      {mediaClip && (
        <>
          <ContextMenuItem
            onSelect={() => patchClip(clip.id, { fit: "cover", ...placementPatch(mediaClip, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }) })}
          >
            <Maximize className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.fillCanvas")}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => patchClip(clip.id, { fit: "contain", ...placementPatch(mediaClip, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }) })}
          >
            <Minimize className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.fitCanvas")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => patchClip(clip.id, placementPatch(clip, { flipH: !tr.flipH }))}>
            <FlipHorizontal2 className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.flipH")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => patchClip(clip.id, placementPatch(clip, { flipV: !tr.flipV }))}>
            <FlipVertical2 className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.flipV")}
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem onSelect={() => patchClip(clip.id, placementPatch(clip, { x: 0.5, y: 0.5 }))}>
        <Crosshair className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.centre")}
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-white/10" />
      <ContextMenuItem disabled={!canForward} onSelect={() => moveTrack(clip.trackId, "front")}>
        <ChevronsUp className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.bringToFront")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canForward} onSelect={() => moveTrack(clip.trackId, "forward")}>
        <ChevronUp className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.bringForward")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canBackward} onSelect={() => moveTrack(clip.trackId, "backward")}>
        <ChevronDown className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.sendBackward")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canBackward} onSelect={() => moveTrack(clip.trackId, "back")}>
        <ChevronsDown className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.sendToBack")}
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-white/10" />
      <ContextMenuItem onSelect={() => duplicateOnCanvas()}>
        <Copy className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.duplicate")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => rippleDelete([clip.id])}
        className="text-red-300 focus:text-red-200"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.delete")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
