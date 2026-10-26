import { clipFontFamilies } from "@/lib/editor/graphicFonts";
import { ensureProjectFonts } from "@/lib/editor/googleFonts";
import { nextDesignLayer } from "@/lib/editor/layerNavigation";
import { SpacingGuides } from "../SpacingGuides";
import { OverlapLayerPicker } from "../OverlapLayerPicker";
import { nextOverlappingLayer } from "@/lib/editor/layerChoices";
import { useTextDraftHistory } from "@/lib/editor/useTextDraftHistory";
import { changeSelectedTextCase, type TextCase } from "@/lib/editor/textCase";
import { selectionSpacingBox, smartSpacingSnap, type SpacingGuide } from "@/lib/editor/smartSpacing";
import { beginDesignColourSample, cancelDesignColourPick, finishDesignColourSample, useDesignColourPick } from "@/lib/editor/designColourPicker";
import { designPrintDpi } from "@/lib/editor/documentDimensions";
import { registerDesignPagePreview } from "@/lib/editor/designPagePreviews";
import { freehandSvg, type PenSettings } from "@/lib/editor/freehand";
import { insertFreehandStroke } from "@/lib/editor/freehandProject";
import { nanoid } from "nanoid";
import { FIT_VIEWPORT, focusDesignSelection, zoomDesignViewport, type DesignViewport } from "@/lib/editor/designViewport";
import { PresentationView } from "./PresentationView";
import { panMediaCrop, zoomMediaCrop } from "@/lib/editor/mediaCrop";
import { GuideEditorLayer } from "../GuideEditorLayer";
import { DesignRulers } from "../DesignRulers";
import { useEditorDraftFocus } from "@/components/editor/useEditorDraftFocus";
import type { ProjectEditLease } from "@/lib/editor/projectEditGate";
import { stepTimelineFrame } from "@/lib/editor/frameStep";
import { createVideoMattePageCache, videoMatteFramesForOps } from "@/lib/editor/videoMattePageCache";
import { loadVideoMatteImage } from "@/lib/editor/videoMatteImages";
import { videoMatteMediaIds } from "@/lib/editor/videoMatte";
import { prepareGifImage, releaseGifImage } from "@/lib/editor/gifImage";
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
import { Type, ChevronLeft, RotateCcw, RotateCw, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown, FlipHorizontal2, FlipVertical2, Minimize, Crosshair, PanelBottomClose, PanelBottomOpen } from "lucide-react";
import Copy from "@/components/ui/cut-icons/copy";
import Trash2 from "@/components/ui/cut-icons/delete";
import Pencil from "@/components/ui/cut-icons/edit";
import Scissors from "@/components/ui/cut-icons/trim";
import Maximize from "@/components/ui/cut-icons/fullscreen";

import Play from "@/components/ui/cut-icons/play";
import Pause from "@/components/ui/cut-icons/pause";
import Repeat from "@/components/ui/cut-icons/repost";
import ChevronRight from "@/components/ui/cut-icons/next";

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
import { recordOpts, useEditorUiStore } from "@/store/editorUiStore";
import type { Clip, ClipTransform, MediaClip, TextClip } from "@/lib/editor/types";
import { applyRenderOpMotion, computeRenderOps, type RenderOp } from "@/lib/editor/transitions";
import { clipBox, drawClip, getTransform, isVisualClip, placementPatch, placementPatchAt, pointInBox, type ClipBox } from "@/lib/editor/render";
import { isAnimated, keyTimes, resolveClipAt } from "@/lib/editor/keyframes";
import { useCloseOnSurfaceSwitch } from "@/hooks/use-surface-switch";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { importFiles } from "@/lib/editor/importFiles";
import { TEXT_DRAG_MIME, type TextPreset } from "@/lib/editor/textPresets";
import { useBgRemovalStore } from "@/store/editorBgRemovalStore";
import { PagesStrip } from "./PagesStrip";
import { GOOGLE_FONTS, loadGoogleFont, primaryFamily } from "@/lib/editor/googleFonts";
import { replaceDesignMedia } from "@/lib/editor/replaceMedia";
import { getDesignGuides } from "@/lib/editor/designGuides";
import { audioGainAt } from "@/lib/editor/audioEnvelope";
import { leaseMedia } from "@/lib/editor/mediaLeases";
import { EditorError } from "@/lib/editor/editorError";

function cloneMedia<T extends HTMLMediaElement>(source: T): T {
  const copy = source.cloneNode(false) as T;
  copy.muted = true;
  copy.preload = "auto";
  copy.src = source.src;
  copy.load();
  return copy;
}
function releaseMedia(source: HTMLMediaElement) {
  source.pause();
  source.removeAttribute("src");
  source.load();
}

const MEDIA_DRAG_MIME = "application/x-dehub-media";
/** Snap distance in screen pixels. */
const SNAP_PX = 6;

function fmtTime(t: number, fps: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const total = Math.floor(t);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const f = Math.min(Math.ceil(fps) - 1, Math.floor((t - total) * fps + 1e-7));
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
  | { mode: "crop"; id: string; clip: MediaClip; box: ClipBox; px: number; py: number }
  | {
      mode: "move"; id: string; px: number; py: number; box: ClipBox; snapBox?: ClipBox; ax: number; ay: number;
      /** Other selected layers that travel with this one. */
      group: { id: string; ax: number; ay: number }[];
    }
  | { mode: "marquee"; x0: number; y0: number; additive: boolean }
  | { mode: "group-transform"; operation: "scale" | "rotate"; cx: number; cy: number; dist: number; angle: number; members: { clip: Clip; transform: ClipTransform }[] }
  | { mode: "scale"; id: string; box: ClipBox; dist: number; scale: number; font: number }
  | { mode: "rotate"; id: string; box: ClipBox; angle: number; rotation: number }
  | { mode: "stretch"; id: string; box: ClipBox; axis: "x" | "y"; scale: number };

export function Compositor() {
  const draftFocus = useEditorDraftFocus("canvas", true);
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  const presentingRef = useRef(false); presentingRef.current = presenting;
  useCloseOnSurfaceSwitch(useCallback(() => setPresenting(false), []));

  const tracks = useEditorStore((s) => s.tracks);
  const clips = useEditorStore((s) => s.clips);
  const fontFamilies = useMemo(() => [...new Set(clipFontFamilies(clips).map(primaryFamily))].sort().join("|"), [clips]);
  useEffect(() => {
    for (const family of fontFamilies.split("|")) {
      const font = GOOGLE_FONTS.find(item => item.family === family);
      if (font) loadGoogleFont(font.family, font.weights);
    }
  }, [fontFamilies]);
  const media = useEditorStore((s) => s.media);
  const settings = useEditorStore((s) => s.settings);
  const layoutGuides = useMemo(() => getDesignGuides(settings.guides), [settings.guides]);
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
  const extraVideos = useRef<Map<string, HTMLVideoElement>>(new Map());
  const extraAudio = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imagePool = useRef<Map<string, HTMLImageElement>>(new Map());
  const gifLoads = useRef(new Map<string, AbortController>());
  const sources = useMemo(() => ({ videos: videoPool.current, images: imagePool.current, videosByClip: new Map<string, HTMLVideoElement>() }), []);
  const previewProject = useEditorStore(state => state.projectId);
  const colourPick = useDesignColourPick(), sampling = colourPick?.projectId === previewProject;
  useEffect(() => { if (presenting && sampling) cancelDesignColourPick(colourPick.token); }, [presenting, sampling, colourPick?.token]);
  useLayoutEffect(() => registerDesignPagePreview(previewProject, async (snapshot, at, maxEdge) => {
    if (useEditorStore.getState().projectId !== snapshot.id) throw new EditorError("copy.ea1bee6586b0", "This design is no longer open");
    await ensureProjectFonts(snapshot.clips);
    if (useEditorStore.getState().projectId !== snapshot.id) throw new EditorError("copy.ea1bee6586b0", "This design is no longer open");
    const { width, height, background } = snapshot.settings, ratio = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d"); if (!context) throw new EditorError("copy.318997283235", "Page previews are unavailable");
    context.scale(canvas.width / width, canvas.height / height); context.fillStyle = background; context.fillRect(0, 0, width, height);
    const hidden = new Set(snapshot.tracks.filter(track => track.hidden).map(track => track.id)), order = new Map(snapshot.tracks.map((track, index) => [track.id, index]));
    const visible = snapshot.clips.filter(clip => isVisualClip(clip) && !clip.hidden && !hidden.has(clip.trackId) && at >= clip.start && at < clip.start + clip.duration).sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0));
    for (const clip of visible) { context.save(); try { drawClip(context, width, height, { ...clip, animateIn: undefined, animateOut: undefined }, at, sources); } finally { context.restore(); } }
    return canvas.toDataURL("image/jpeg", 0.75);
  }), [previewProject, sources]);
  useEffect(() => () => {
    extraVideos.current.forEach(releaseMedia);
    extraAudio.current.forEach(releaseMedia);
    gifLoads.current.forEach(controller => controller.abort());
    gifLoads.current.clear();
    imagePool.current.forEach(image => { releaseGifImage(image); image.src = ""; });
    imagePool.current.clear();
  }, []);

  const mediaRef = useRef(media); mediaRef.current = media;
  const mattePages = useRef<ReturnType<typeof createVideoMattePageCache> | null>(null);
  useEffect(() => {
    const cache = createVideoMattePageCache(imagePool.current, frame => loadVideoMatteImage(mediaRef.current, frame), image => { image.src = ""; });
    mattePages.current = cache;
    return () => { cache.dispose(); if (mattePages.current === cache) mattePages.current = null; };
  }, []);

  // A reopened project can deliver its clips before the stored mask pages.
  // Retry a failed page only when the actual source list changes.
  useEffect(() => { mattePages.current?.refreshSources(); }, [media]);

  // Provision elements when media changes.
  useEffect(() => {
    const vPool = videoPool.current;
    const aPool = audioPool.current;
    const iPool = imagePool.current;
    const matteIds = new Set(clips.flatMap(c => c.kind === "video" ? videoMatteMediaIds(c.videoMatte) : []));
    const decoded = media.filter(m => !m.name.startsWith(".dehub-video-matte-") && !matteIds.has(m.id));
    const liveIds = new Set(decoded.map((m) => m.id));

    for (const m of decoded) {
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
      if ((m.kind === "audio" || clips.some((c) => c.kind === "audio" && c.mediaId === m.id)) && !aPool.has(m.id)) {
        const a = new Audio(m.url);
        a.preload = "auto";
        aPool.set(m.id, a);
      }
      if (m.kind === "image" && !iPool.has(m.id)) {
        const img = new Image();
        if (!m.url.startsWith("blob:")) img.crossOrigin = "anonymous";
        iPool.set(m.id, img);
        if (m.mimeType === "image/gif") {
          const controller = new AbortController();
          gifLoads.current.set(m.id, controller);
          void prepareGifImage(img, m.url, controller.signal).then(() => {
            if (!controller.signal.aborted && iPool.get(m.id) === img) img.src = m.url;
          }).catch(() => {
            if (iPool.get(m.id) === img) { releaseGifImage(img); iPool.delete(m.id); img.src = ""; }
          }).finally(() => {
            if (gifLoads.current.get(m.id) === controller) gifLoads.current.delete(m.id);
          });
        } else img.src = m.url;
      }
    }
    // GC dropped media.
    for (const id of Array.from(vPool.keys())) if (!liveIds.has(id)) { vPool.get(id)?.pause(); vPool.delete(id); }
    for (const id of Array.from(aPool.keys())) if (!liveIds.has(id)) { aPool.get(id)?.pause(); aPool.delete(id); }
    for (const id of Array.from(iPool.keys())) if (!liveIds.has(id) && !matteIds.has(id)) {
      gifLoads.current.get(id)?.abort(); gifLoads.current.delete(id);
      const image = iPool.get(id); if (image) { releaseGifImage(image); image.src = ""; } iPool.delete(id);
    }
  }, [media, clips]);

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
      for (const v of extraVideos.current.values()) v.pause();
      for (const a of extraAudio.current.values()) a.pause();
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
      try { void mattePages.current?.select(videoMatteFramesForOps(renderOps, time)).catch(() => {}); } catch { /* Missing masks stay hidden until restored. */ }

      // Sync video/audio media.
      const activeVideos = leaseMedia<HTMLVideoElement>(renderOps.flatMap(op => op.clip.kind === "video" ? [op.clip] : []), videoPool.current, extraVideos.current, cloneMedia, releaseMedia);
      const activeAudio = leaseMedia<HTMLAudioElement>(active.flatMap(clip => clip.kind === "audio" ? [clip] : []), audioPool.current, extraAudio.current, cloneMedia, releaseMedia);
      sources.videosByClip = activeVideos;

      // Video sync uses render-ops so incoming pre-roll clips also seek to the right frame.
      for (const op of renderOps) {
        if (op.clip.kind !== "video") continue;
        const mc = op.clip as MediaClip;
        const v = activeVideos.get(mc.id);
        if (!v) continue;
        const track = state.tracks.find((tr) => tr.id === mc.trackId);
        v.muted = !!track?.muted || !!track?.hidden || !!mc.hidden || !state.isPlaying;
        v.volume = Math.min(1, audioGainAt(mc, time));
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
        const a = activeAudio.get(mc.id);
        const track = state.tracks.find((tr) => tr.id === mc.trackId);
        if (!a) continue;
        a.muted = !!track?.muted || !!track?.hidden || !!mc.hidden;
        a.volume = Math.min(1, audioGainAt(mc, time));
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
      const playingVideos = new Set(activeVideos.values());
      const playingAudio = new Set(activeAudio.values());
      for (const v of videoPool.current.values()) {
        if (!playingVideos.has(v) && !v.paused) v.pause();
      }
      for (const a of audioPool.current.values()) {
        if (!playingAudio.has(a) && !a.paused) a.pause();
      }

      // Draw to canvas.
      const canvas = canvasRef.current;
      if (canvas && !presentingRef.current) {
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
            applyRenderOpMotion(ctx, op, W, H);
            if (op.clipRect) {
              ctx.beginPath();
              ctx.rect(op.clipRect.x, 0, op.clipRect.w, H);
              ctx.clip();
            }
            ctx.globalAlpha = op.alpha;
            drawClip(ctx, W, H, op.clip, time, sources, op.localTimeOverride);
            ctx.restore();
          }

          // Keep the selection box in step with what was just drawn.
          const selId = state.selectedClipIds.length === 1 ? state.selectedClipIds[0] : null;
          const sel = selId ? state.clips.find((c) => c.id === selId) : null;
          const visible = sel && isVisualClip(sel) && !sel.hidden && time >= sel.start && time <= sel.start + sel.duration;
          const next = visible ? clipBox(ctx, resolveClipAt(sel, time), W, H, sources) : null;
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
  const [fitScale, setFitScale] = useState(0);
  const [viewport, setViewport] = useState<DesignViewport>(FIT_VIEWPORT);
  const [navigating, setNavigating] = useState(false);
  const [editingGuides, setEditingGuides] = useState(false);
  const viewportCleanup = useRef<(() => void) | null>(null);
  const viewportProject = useEditorStore(s => s.projectId);
  const scale = fitScale * viewport.zoom;
  useEffect(() => { viewportCleanup.current?.(); setViewport(FIT_VIEWPORT); setNavigating(false); setEditingGuides(false); setPresenting(false); }, [viewportProject, settings.width, settings.height]);
  useEffect(() => () => viewportCleanup.current?.(), []);
  useCloseOnSurfaceSwitch(useCallback(() => { viewportCleanup.current?.(); setNavigating(false); setEditingGuides(false); }, []));
  useEffect(() => {
    if (!editingGuides) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setEditingGuides(false); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [editingGuides]);
  const startViewportPan = (event: React.PointerEvent<Element>) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); viewportCleanup.current?.();
    const before = viewport, x = event.clientX, y = event.clientY, pointer = event.pointerId;
    const move = (next: PointerEvent) => { if (next.pointerId === pointer) setViewport({ ...before, x: before.x + next.clientX - x, y: before.y + next.clientY - y }); };
    const end = (next: PointerEvent) => { if (next.pointerId === pointer) cleanup(); };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); viewportCleanup.current = null; };
    viewportCleanup.current = cleanup;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  };
  useEffect(() => {
    const element = wrapRef.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      viewportCleanup.current?.();
      const rect = element.getBoundingClientRect(), anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      setViewport(before => zoomDesignViewport(before, before.zoom * Math.exp(-event.deltaY * 0.002), anchor));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
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
    setFitScale(Math.max(0.01, s));
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
      .map((clip) => ({ clip, box: clipBox(ctx, resolveClipAt(clip, now), s.settings.width, s.settings.height, sources) }))
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

  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [overlapIds, setOverlapIds] = useState<string[] | null>(null), [contextLayerIds, setContextLayerIds] = useState<string[]>([]);
  useEffect(() => setOverlapIds(null), [viewportProject, currentTime]);
  useCloseOnSurfaceSwitch(useCallback(() => setOverlapIds(null), []));
  const cropProject = useEditorStore(s => s.projectId);
  useEffect(() => setCroppingId(null), [cropProject]);
  useEffect(() => { if (croppingId && (selectedClipIds.length !== 1 || selectedClipIds[0] !== croppingId || !clips.some(c => c.id === croppingId && !c.locked))) setCroppingId(null); }, [croppingId, selectedClipIds, clips]);
  useCloseOnSurfaceSwitch(useCallback(() => setCroppingId(null), []));
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const editingText = useMemo(() => {
    if (!editingTextId) return null;
    const c = clips.find((x) => x.id === editingTextId);
    return c && c.kind === "text" ? (c as TextClip) : null;
  }, [editingTextId, clips]);

  const textEditLease = useRef<ProjectEditLease | null>(null);
  const textEditOriginal = useRef<TextClip | null>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const finishTextEditing = useCallback(() => {
    const lease = textEditLease.current;
    textEditLease.current = null;
    textEditOriginal.current = null;
    lease?.release();
    setEditingTextId(null);
  }, []);
  useLayoutEffect(() => () => {
    const lease = textEditLease.current;
    textEditLease.current = null;
    textEditOriginal.current = null;
    lease?.release();
  }, [editingTextId, cropProject]);
  useEffect(() => {
    if (editingTextId && (!editingText || editingText.locked || selectedClipIds.length !== 1 || selectedClipIds[0] !== editingTextId)) finishTextEditing();
  }, [editingTextId, editingText, selectedClipIds, finishTextEditing]);
  useCloseOnSurfaceSwitch(finishTextEditing);
  const textHistory = useTextDraftHistory(`${cropProject}:${editingTextId}`, editingText?.text ?? "", value => {
    const store = useEditorStore.getState(), clip = store.clips.find(clip => clip.id === editingTextId);
    if (store.projectId !== cropProject || !clip || clip.kind !== "text" || clip.locked) return;
    if (!textEditLease.current) { textEditOriginal.current = clip; textEditLease.current = store.beginGesture(); }
    const original = textEditOriginal.current;
    if (textEditLease.current.isCurrent()) store.patchClipLive(clip.id, { text: value, pageNumber: original?.text === value ? original.pageNumber : undefined });
  });
  const applyTextCase = (mode: TextCase) => {
    const input = textInput.current;
    if (!input || !editingText) return;
    const next = changeSelectedTextCase(editingText.text, { start: input.selectionStart, end: input.selectionEnd }, mode);
    textHistory.change(next.value);
    requestAnimationFrame(() => { if (textInput.current === input && input.isConnected) { input.focus(); input.setSelectionRange(next.selection.start, next.selection.end); } });
  };

  useLayoutEffect(() => {
    const input = textInput.current; if (!input || !editingTextId) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(Math.max(32, input.scrollHeight), Math.max(48, (surfaceRef.current?.clientHeight ?? 400) - 24))}px`;
  }, [editingTextId, editingText?.text, editingText?.fontSize, editingText?.fontFamily, editingText?.fontWeight, editingText?.maxWidth, editingText?.lineHeight, editingText?.letterSpacing, scale]);

  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    const c = clips.find((x) => x.id === selectedClipIds[0]);
    return c && isVisualClip(c) ? c : null;
  }, [selectedClipIds, clips]);

  const [spacingGuides, setSpacingGuides] = useState<SpacingGuide[]>([]);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // Drag-to-select rectangle, in canvas pixels.
  const [marquee, setMarqueeState] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const setMarquee = useCallback((m: typeof marquee) => {
    marqueeRef.current = m;
    setMarqueeState(m);
  }, []);
  const gestureRef = useRef<Gesture | null>(null);
  const gestureLease = useRef<ProjectEditLease | null>(null);
  const strokeCleanup = useRef<(() => void) | null>(null);

  const onGestureMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g || !gestureLease.current?.isCurrent()) return;
    const s = useEditorStore.getState();
    const W = s.settings.width;
    const H = s.settings.height;
    const p = toCanvas(e.clientX, e.clientY);

    if (g.mode === "crop") {
      const patch = panMediaCrop(g.clip, g.box, p.x - g.px, p.y - g.py);
      if (patch) s.patchClipLive(g.id, patch);
      return;
    }

    if (g.mode === "marquee") {
      setMarquee({ x: Math.min(g.x0, p.x), y: Math.min(g.y0, p.y), w: Math.abs(p.x - g.x0), h: Math.abs(p.y - g.y0) });
      return;
    }

    if (g.mode === "group-transform") {
      const ratio = g.operation === "scale" ? Math.max(0.05, Math.min(20, Math.hypot(p.x - g.cx, p.y - g.cy) / Math.max(1, g.dist))) : 1;
      let degrees = g.operation === "rotate" ? (Math.atan2(p.y - g.cy, p.x - g.cx) - g.angle) * 180 / Math.PI : 0;
      if (e.shiftKey) degrees = Math.round(degrees / 15) * 15;
      const rad = degrees * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      for (const { clip: member, transform: tr } of g.members) {
        const x = (tr.x * W - g.cx) * ratio, y = (tr.y * H - g.cy) * ratio;
        const place = { x: (g.cx + x * cos - y * sin) / W, y: (g.cy + x * sin + y * cos) / H,
          ...(g.operation === "rotate" ? { rotation: tr.rotation + degrees } : {}),
          ...(g.operation === "scale" && member.kind !== "text" ? { scale: Math.max(0.05, Math.min(20, tr.scale * ratio)) } : {}) };
        s.patchClipLive(member.id, { ...placementPatchAt(member, place, s.currentTime, recordOpts()),
          ...(g.operation === "scale" && member.kind === "text" ? { fontSize: Math.max(6, Math.min(1000, member.fontSize * ratio)) } : {}) });
      }
      return;
    }

    const clip = s.clips.find((c) => c.id === g.id);
    if (!clip) return;

    if (g.mode === "move") {
      const snapBox = g.snapBox ?? g.box;
      let cx = snapBox.cx + (p.x - g.px);
      let cy = snapBox.cy + (p.y - g.py);
      const snapDist = SNAP_PX / Math.max(0.01, scale);
      const { hw, hh } = halfExtents(snapBox);
      const moving = new Set([g.id, ...g.group.map((m) => m.id)]);
      const others = layersAt().filter((l) => !moving.has(l.clip.id));
      const xs = [0, W / 2, W];
      const ys = [0, H / 2, H];
      const persistent = getDesignGuides(s.settings.guides);
      if (persistent.snap) {
        xs.push(...persistent.vertical.map(value => value * W)); ys.push(...persistent.horizontal.map(value => value * H));
        if (persistent.margin) { const margin = persistent.margin * Math.min(W, H); xs.push(margin, W - margin); ys.push(margin, H - margin); }
      }
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
      const spacing = !e.altKey && persistent.spacing ? smartSpacingSnap({ ...snapBox, cx, cy }, others.filter(layer => !layer.clip.isPageBackground).map(layer => layer.box), snapDist, { horizontal: !sx, vertical: !sy }) : { dx: 0, dy: 0, guides: [] };
      cx += spacing.dx; cy += spacing.dy; setSpacingGuides(spacing.guides);
      const dx = (cx - snapBox.cx) / W;
      const dy = (cy - snapBox.cy) / H;
      s.patchClipLive(g.id, placementPatchAt(clip, { x: g.ax + dx, y: g.ay + dy }, s.currentTime, recordOpts()));
      for (const m of g.group) {
        const other = s.clips.find((c) => c.id === m.id);
        if (other) s.patchClipLive(m.id, placementPatchAt(other, { x: m.ax + dx, y: m.ay + dy }, s.currentTime, recordOpts()));
      }
      return;
    }

    if (g.mode === "scale") {
      const dist = Math.hypot(p.x - g.box.cx, p.y - g.box.cy);
      const k = dist / Math.max(1, g.dist);
      if (clip.kind === "text") {
        s.patchClipLive(g.id, { fontSize: Math.round(Math.max(6, Math.min(800, g.font * k))) });
      } else {
        s.patchClipLive(g.id, placementPatchAt(clip, { scale: Math.max(0.05, Math.min(20, g.scale * k)) }, s.currentTime, recordOpts()));
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
    s.patchClipLive(g.id, placementPatchAt(clip, { rotation: Math.round(rot * 10) / 10 }, s.currentTime, recordOpts()));
  }, [toCanvas, layersAt, scale, setMarquee]);

  const onGestureEnd = useCallback(() => {
    const g = gestureRef.current;
    if (g?.mode === "marquee" && gestureLease.current?.isCurrent()) {
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
    gestureLease.current?.release(); gestureLease.current = null;
    setGuides({ v: [], h: [] }); setSpacingGuides([]);
    window.removeEventListener("pointermove", onGestureMove);
    window.removeEventListener("pointerup", onGestureEnd);
    window.removeEventListener("pointercancel", onGestureEnd);
  }, [onGestureMove, layersAt, setMarquee]);

  const startGesture = useCallback((g: Gesture) => {
    onGestureEnd();
    gestureLease.current = useEditorStore.getState().beginGesture();
    gestureRef.current = g;
    window.addEventListener("pointermove", onGestureMove);
    window.addEventListener("pointerup", onGestureEnd);
    window.addEventListener("pointercancel", onGestureEnd);
  }, [onGestureMove, onGestureEnd]);

  useEffect(() => () => { onGestureEnd(); strokeCleanup.current?.(); }, [onGestureEnd]);
  useCloseOnSurfaceSwitch(onGestureEnd);
  useEffect(() => {
    if (!croppingId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]"))) return;
      event.preventDefault(); onGestureEnd(); setCroppingId(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [croppingId, onGestureEnd]);

  useEffect(() => {
    const begin = (event: Event) => {
      if (!wrapRef.current?.getClientRects().length) return;
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const store = useEditorStore.getState(), clip = store.clips.find(value => value.id === id);
      if (!clip || clip.locked || (clip.kind !== "image" && clip.kind !== "video")) return;
      onGestureEnd(); setEditingGuides(false); setNavigating(false); store.setIsPlaying(false); store.selectGroupMember(id); setCroppingId(id);
    };
    window.addEventListener("editor:crop-photo", begin);
    return () => window.removeEventListener("editor:crop-photo", begin);
  }, [onGestureEnd]);
  useEffect(() => {
    const begin = (event: Event) => {
      if (!wrapRef.current?.getClientRects().length) return;
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const store = useEditorStore.getState(), clip = store.clips.find(value => value.id === id);
      if (clip?.kind !== "text" || clip.locked) return;
      onGestureEnd(); setEditingGuides(false); setNavigating(false); setCroppingId(null); store.setIsPlaying(false); store.selectGroupMember(clip.id);
      if (draftFocus.begin()) setEditingTextId(clip.id);
    };
    window.addEventListener("editor:edit-text", begin);
    return () => window.removeEventListener("editor:edit-text", begin);
  }, [onGestureEnd, draftFocus.begin]);


  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>, pen: PenSettings) => {
    strokeCleanup.current?.();
    const strokeTime = useEditorStore.getState().currentTime; useEditorStore.getState().setIsPlaying(false);
    const lease = useEditorStore.getState().holdEdits();
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
      if (!lease.isCurrent()) return;
      push(ev.clientX, ev.clientY);
      setStroke([...pts]);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setStroke(null);
      strokeCleanup.current = null;
    };
    const onUp = () => {
      cleanup();
      if (!lease.isCurrent()) return;
      try {
      if (!pts.length) return;
      const s = useEditorStore.getState();
      const before = s.toSnapshot(), result = insertFreehandStroke(before, strokeTime, pts, pen, () => nanoid(10));
      if (result) s.applyDesignEdit(before, result.project);
      // Keep drawing: no selection box getting in the way of the next stroke.
      useEditorStore.getState().selectClip(null);
      } finally { lease.release(); }
    };
    strokeCleanup.current = () => { cleanup(); lease.release(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingTextId || editingGuides || sampling) return;
    if (e.button !== 0) return;
    if (navigating) { startViewportPan(e); return; }
    if (draw) {
      startStroke(e, draw);
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    const p = toCanvas(e.clientX, e.clientY);
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !croppingId) {
      e.preventDefault(); onGestureEnd();
      const ids = layersAt().filter(layer => pointInBox(layer.box, p.x, p.y)).reverse().map(layer => layer.clip.id);
      const next = nextOverlappingLayer(ids, selectedClipIds[0] ?? null);
      if (next) selectClip(next);
      return;
    }
    if (croppingId && hit?.clip.id === croppingId && (hit.clip.kind === "image" || hit.clip.kind === "video")) {
      startGesture({ mode: "crop", id: hit.clip.id, clip: hit.clip, box: hit.box, px: p.x, py: p.y });
      return;
    }
    if (croppingId) setCroppingId(null);
    if (hit?.clip.isPageBackground) { selectClip(hit.clip.id); return; }
    if (!hit) {
      // Drag on empty canvas draws a selection box; a plain click clears.
      if (!e.shiftKey) selectClip(null);
      onGestureEnd();
      gestureLease.current = useEditorStore.getState().holdEdits();
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
    const actualSelection = useEditorStore.getState().selectedClipIds;
    if (useEditorStore.getState().clips.some(c => actualSelection.includes(c.id) && c.locked)) return;
    const now = useEditorStore.getState().currentTime;
    const tr = getTransform(resolveClipAt(hit.clip, now));
    const all = useEditorStore.getState().clips;
    const group = actualSelection.length > 1
      ? actualSelection
          .filter((id) => id !== hit.clip.id)
          .map((id) => all.find((c) => c.id === id))
          .filter((c): c is Clip => !!c && isVisualClip(c) && !c.locked)
          .map((c) => { const r = getTransform(resolveClipAt(c, now)); return { id: c.id, ax: r.x, ay: r.y }; })
      : [];
    startGesture({ mode: "move", id: hit.clip.id, px: p.x, py: p.y, box: hit.box, snapBox: selectionSpacingBox(layersAt().filter(layer => actualSelection.includes(layer.clip.id)).map(layer => layer.box)), ax: tr.x, ay: tr.y, group });
  };

  const onHandleDown = (mode: "scale" | "rotate" | "stretch-x" | "stretch-y") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedClip || !selBox) return;
    const p = toCanvas(e.clientX, e.clientY);
    const tr = getTransform(resolveClipAt(selectedClip, useEditorStore.getState().currentTime));
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
    if (editingGuides) return;
    if (navigating) { viewportCleanup.current?.(); setViewport(FIT_VIEWPORT); return; }
    const hit = hitTest(e.clientX, e.clientY);
    if (hit && hit.clip.kind === "text") {
      if (hit.clip.groupId) useEditorStore.getState().selectGroupMember(hit.clip.id); else selectClip(hit.clip.id);
      if (draftFocus.begin()) setEditingTextId(hit.clip.id);
    } else if (hit) {
      if (hit.clip.kind === "image" || hit.clip.kind === "video") {
        onGestureEnd(); setNavigating(false); useEditorStore.getState().selectGroupMember(hit.clip.id); useEditorStore.getState().setIsPlaying(false); setCroppingId(hit.clip.id);
      }
      if (hit.clip.groupId) useEditorStore.getState().selectGroupMember(hit.clip.id); else selectClip(hit.clip.id);
      window.dispatchEvent(new Event("editor:open-inspector"));
    }
  };
  const onCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = toCanvas(e.clientX, e.clientY);
    setContextLayerIds(layersAt().filter(layer => pointInBox(layer.box, point.x, point.y)).reverse().map(layer => layer.clip.id));
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
        if (typeof parsed.mediaId === "string") {
          const s = useEditorStore.getState(), hit = hitTest(e.clientX, e.clientY);
          const source = s.media.find(media => media.id === parsed.mediaId);
          const target = hit?.clip;
          if (target && (((target.kind === "image" || target.kind === "video") && target.frame) || (target.kind === "shape" && target.photoFrame)) && source && source.kind !== "audio") {
            const before = s.toSnapshot(), previous = "mediaId" in target ? s.media.find(media => media.id === target.mediaId) : undefined;
            const next = replaceDesignMedia(before, target.id, source, previous);
            if (next !== before) { s.applyDesignEdit(before, next); s.selectClip(target.id); }
          } else placeAt(addClipFromMedia(parsed.mediaId), nx, ny);
        }
      } catch { /* noop */ }
      return;
    }

    if (e.dataTransfer.files?.length) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const scope = useEditorStore.getState().projectId;
      const target = hitTest(e.clientX, e.clientY)?.clip;
      const frameTarget = target && (((target.kind === "image" || target.kind === "video") && target.frame) || (target.kind === "shape" && target.photoFrame)) ? target : null;
      void importFiles(files, { wallet: quota.walletAddress }).then((ids) => {
        const s = useEditorStore.getState();
        if (s.projectId !== scope) return;
        if (frameTarget && ids.length === 1) {
          if (s.clips.find(c => c.id === frameTarget.id) !== frameTarget) return;
          const source = s.media.find(media => media.id === ids[0]);
          if (!source || source.kind === "audio") return;
          const before = s.toSnapshot(), previous = "mediaId" in frameTarget ? s.media.find(media => media.id === frameTarget.mediaId) : undefined;
          const next = replaceDesignMedia(before, frameTarget.id, source, previous);
          if (next !== before) { s.applyDesignEdit(before, next); s.selectGroupMember(frameTarget.id); }
          return;
        }
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
  const onGroupHandleDown = (operation: "scale" | "rotate") => (event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!groupBounds || scale <= 0) return;
    const s = useEditorStore.getState();
    const members = s.clips.filter(c => selectedClipIds.includes(c.id) && isVisualClip(c));
    if (members.length < 2 || members.some(c => c.locked)) return;
    const cx = (groupBounds.left + groupBounds.width / 2) / scale, cy = (groupBounds.top + groupBounds.height / 2) / scale;
    const p = toCanvas(event.clientX, event.clientY);
    startGesture({ mode: "group-transform", operation, cx, cy, dist: Math.hypot(p.x - cx, p.y - cy), angle: Math.atan2(p.y - cy, p.x - cx),
      members: members.map(clip => ({ clip, transform: getTransform(resolveClipAt(clip, s.currentTime)) })) });
  };

  // Where the selected layer travels over its clip: a dashed path with a
  // diamond at each keyframe, drawn only when its position is animated.
  const recording = useEditorUiStore((s) => s.recordMotion);
  const motionPath = useMemo(() => {
    if (!selectedClip || !(isAnimated(selectedClip, "x") || isAnimated(selectedClip, "y"))) return null;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const W = settings.width;
    const H = settings.height;
    const centreAt = (t: number): [number, number] => {
      const c = resolveClipAt(selectedClip, t);
      const b = clipBox(ctx, c, W, H, sources);
      const tr = getTransform(c);
      return b ? [b.cx, b.cy] : [tr.x * W, tr.y * H];
    };
    const N = 64;
    const pts = Array.from({ length: N + 1 }, (_, i) => centreAt(selectedClip.start + (selectedClip.duration * i) / N));
    const keys = keyTimes(selectedClip).filter((k) => k <= selectedClip.duration + 0.001).map((k) => centreAt(selectedClip.start + k));
    return { pts, keys };
  }, [selectedClip, settings.width, settings.height, sources]);

  const overlay = selBox && selectedClip && !selectedClip.locked && !selectedClip.isPageBackground && !editingTextId && !croppingId && !navigating && !editingGuides && !sampling && scale > 0
    ? {
        left: (selBox.cx - selBox.w / 2) * scale,
        top: (selBox.cy - selBox.h / 2) * scale,
        width: selBox.w * scale,
        height: selBox.h * scale,
        rotation: selBox.rotation,
      }
    : null;

  const focusSelection = () => {
    const store = useEditorStore.getState(), wrap = wrapRef.current;
    if (!wrap) return;
    const boxes = layersAt().filter(layer => store.selectedClipIds.includes(layer.clip.id)).map(layer => layer.box);
    const next = focusDesignSelection(boxes, store.settings, fitScale, { width: wrap.clientWidth, height: wrap.clientHeight });
    if (next) { onGestureEnd(); viewportCleanup.current?.(); store.setIsPlaying(false); setEditingGuides(false); setViewport(next); }
  };
  useEffect(() => {
    const command = (event: Event) => {
      if (!wrapRef.current?.getClientRects().length || presentingRef.current) return;
      if (event.type === "editor:focus-selection") focusSelection();
      else { viewportCleanup.current?.(); setViewport(FIT_VIEWPORT); }
    };
    window.addEventListener("editor:focus-selection", command); window.addEventListener("editor:fit-page", command);
    return () => { window.removeEventListener("editor:focus-selection", command); window.removeEventListener("editor:fit-page", command); };
  }, [fitScale, layersAt, onGestureEnd]);

  return (
    <section data-glass-editor-canvas className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-black">
      {sampling && <div role="status" className="flex shrink-0 items-center gap-3 border-b border-cyan-300/20 bg-neutral-950 px-3 py-2 text-xs text-cyan-100"><span className="min-w-0 flex-1">{colourPick.error || t("editor.colourPicker.canvasHint", { defaultValue: "Click a colour on the page. Escape cancels." })}</span><button type="button" onClick={() => cancelDesignColourPick(colourPick.token)} className="min-h-8 rounded-lg border border-white/20 px-3">{t("common.cancel", { defaultValue: "Cancel" })}</button></div>}
      {presenting && <PresentationView sources={sources} onClose={() => setPresenting(false)} />}
      {croppingId && <div className="flex shrink-0 items-center gap-2 border-b border-white/15 bg-neutral-950 px-3 py-2 text-xs text-white/70"><span className="min-w-0 flex-1">{t("editor.crop.canvasHint", { defaultValue: "Drag to move the image inside its frame." })}</span>{[0.9, 1.1].map(zoom => <button type="button" key={zoom} aria-label={t(zoom < 1 ? "editor.crop.zoomOut" : "editor.crop.zoomIn", { defaultValue: zoom < 1 ? "Zoom image out" : "Zoom image in" })} onClick={() => { const store = useEditorStore.getState(), clip = store.clips.find(c => c.id === croppingId); if (clip && (clip.kind === "image" || clip.kind === "video")) { const patch = zoomMediaCrop(clip, zoom); if (patch) store.patchClip(clip.id, patch); } }} className="min-h-8 min-w-8 rounded-lg border border-white/20 px-2">{zoom < 1 ? "−" : "+"}</button>)}<button type="button" onClick={() => { onGestureEnd(); setCroppingId(null); }} className="min-h-8 rounded-lg bg-white px-3 font-medium text-black">{t("editor.crop.done", { defaultValue: "Done" })}</button></div>}

      <div {...draftFocus.props}
        ref={wrapRef}
        onPointerDown={event => { if (navigating && !editingTextId && !(event.target instanceof Element && event.target.closest("button, input, textarea, select"))) startViewportPan(event); }}
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
            position: "absolute", left: "50%", top: "50%",
            transform: `translate(calc(-50% + ${viewport.x}px), calc(-50% + ${viewport.y}px))`,
            cursor: navigating ? "grab" : undefined,
          }}
          className={cn(
            "relative col-start-1 row-start-1 rounded-lg shadow-2xl ring-1 ring-white/10",
            recording && "ring-2 ring-red-500/70",
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
                    navigating ? "cursor-grab" : draw ? "cursor-crosshair" : editingTextId ? "cursor-text" : selectedClip ? "cursor-move" : "cursor-default",
                  )}
                />
              </ContextMenuTrigger>
              <CanvasContextMenu clip={selectedClip} overlapCount={contextLayerIds.length} onPickLayers={() => setOverlapIds(contextLayerIds)} onEdit={(id) => { if (draftFocus.begin()) setEditingTextId(id); }} />
            </ContextMenu>
          </div>

          {groupBounds && !navigating && !croppingId && !editingGuides && !sampling && (
            <div className="pointer-events-none absolute rounded-[2px] border-2 border-dashed border-white/90"
              style={groupBounds}>
              <button type="button" aria-label={t("editor.groups.resize", { defaultValue: "Resize selection" })} title={t("editor.groups.resize", { defaultValue: "Resize selection" })} onPointerDown={onGroupHandleDown("scale")} className="pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-black bg-white" />
              <button type="button" aria-label={t("editor.groups.rotate", { defaultValue: "Rotate selection" })} title={t("editor.groups.rotate", { defaultValue: "Rotate selection" })} onPointerDown={onGroupHandleDown("rotate")} className="pointer-events-auto absolute -top-8 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border border-black bg-white" />
            </div>
          )}
          {marquee && (
            <div className="pointer-events-none absolute border border-sky-300 bg-sky-300/10"
              style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale }} />
          )}

          {stroke && draw && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <path
                d={freehandSvg(stroke, scale, scale, draw.smoothing ?? 1, !!draw.closed)}
                opacity={draw.opacity ?? 1}
                strokeDasharray={draw.dash?.map(value => value * settings.height / 1080 * scale).join(" ")}
                fill="none"
                stroke={draw.color}
                strokeWidth={Math.max(0.1, (draw.width / 1080) * settings.height * scale)}
                strokeLinecap={stroke.length === 1 ? "round" : draw.cap ?? "round"}
                strokeLinejoin={draw.join ?? "round"}
              />
            </svg>
          )}

          {motionPath && !editingTextId && !editingGuides && scale > 0 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <polyline
                points={motionPath.pts.map(([x, y]) => `${x * scale},${y * scale}`).join(" ")}
                fill="none"
                stroke="#7dd3fc"
                strokeOpacity={0.85}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              {motionPath.keys.map(([x, y], i) => (
                <rect key={i} x={x * scale - 4} y={y * scale - 4} width={8} height={8}
                  transform={`rotate(45 ${x * scale} ${y * scale})`} fill="#7dd3fc" stroke="#0c4a6e" />
              ))}
            </svg>
          )}

          {recording && (
            <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
              {t("editor.motion.recording")}
            </div>
          )}

          {croppingId && selBox && <div aria-hidden className="pointer-events-none absolute border-2 border-cyan-300" style={{ left: (selBox.cx - selBox.w / 2) * scale, top: (selBox.cy - selBox.h / 2) * scale, width: selBox.w * scale, height: selBox.h * scale, transform: `rotate(${selBox.rotation}deg)` }}>{[1 / 3, 2 / 3].map(n => <div key={n}><div className="absolute bottom-0 top-0 w-px bg-white/50" style={{ left: `${n * 100}%` }} /><div className="absolute left-0 right-0 h-px bg-white/50" style={{ top: `${n * 100}%` }} /></div>)}</div>}
          {/* Snapping guides */}
          {(layoutGuides.rulers || editingGuides) && <DesignRulers width={settings.width} height={settings.height} scale={scale} unit={layoutGuides.unit} dpi={designPrintDpi(settings)} />}
          {layoutGuides.visible && !editingGuides && layoutGuides.vertical.map(x => <div key={`layout-v${x}`} aria-hidden className="pointer-events-none absolute bottom-0 top-0 w-px bg-cyan-400/65" style={{ left: x * settings.width * scale }} />)}
          {layoutGuides.visible && !editingGuides && layoutGuides.horizontal.map(y => <div key={`layout-h${y}`} aria-hidden className="pointer-events-none absolute left-0 right-0 h-px bg-cyan-400/65" style={{ top: y * settings.height * scale }} />)}
          {layoutGuides.visible && layoutGuides.margin > 0 && <div aria-hidden className="pointer-events-none absolute border border-dashed border-cyan-300/60" style={{ inset: layoutGuides.margin * Math.min(settings.width, settings.height) * scale }} />}
          {guides.v.map((x) => (
            <div key={`v${x}`} className="pointer-events-none absolute top-0 bottom-0 w-px bg-fuchsia-400"
              style={{ left: x * scale }} />
          ))}
          {guides.h.map((y) => (
            <div key={`h${y}`} className="pointer-events-none absolute left-0 right-0 h-px bg-fuchsia-400"
              style={{ top: y * scale }} />
          ))}

          {sampling && <div className="absolute inset-0 z-30 cursor-crosshair touch-none" onPointerDown={event => {
            if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
            const token = beginDesignColourSample(previewProject); if (token === null) return;
            try { const canvas = canvasRef.current, point = toCanvas(event.clientX, event.clientY), context = canvas?.getContext("2d"); if (!canvas || !context) throw new EditorError("copy.8cdd3ee85c0e", "The canvas is not ready");
              const pixel = context.getImageData(Math.max(0, Math.min(canvas.width - 1, Math.floor(point.x))), Math.max(0, Math.min(canvas.height - 1, Math.floor(point.y))), 1, 1).data;
              finishDesignColourSample(token, "#" + Array.from(pixel.slice(0, 3)).map(value => value.toString(16).padStart(2, "0")).join(""));
            } catch { finishDesignColourSample(token, null, t("editor.colourPicker.failed", { defaultValue: "Could not read the canvas colour. Try again or enter a colour value." })); }
          }} />}
          <GuideEditorLayer active={editingGuides} disabled={sampling || presenting || (!editingGuides && (!!croppingId || !!editingTextId || !!draw || navigating))} rulers={layoutGuides.rulers || editingGuides} surface={surfaceRef} width={settings.width} height={settings.height} scale={scale} projectId={viewportProject} onActivate={() => { useEditorStore.getState().setIsPlaying(false); setEditingGuides(true); }} />

          <SpacingGuides guides={spacingGuides} scale={scale} />
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
          {editingText && (<>
            <div data-inline-text-tools role="toolbar" aria-label={t("editor.text.editingTools", { defaultValue: "Text editing tools" })} className="absolute bottom-3 left-3 right-3 z-20 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-xl border border-white/20 bg-neutral-950/95 p-1.5 shadow-lg" onMouseDown={event => event.preventDefault()} onBlur={event => { const target = event.relatedTarget; if (target !== textInput.current && !(target instanceof Element && target.closest("[data-inline-text-tools]"))) finishTextEditing(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); finishTextEditing(); draftFocus.finish(); } }}>
              <button type="button" disabled={!textHistory.canUndo} onClick={textHistory.undo} className="min-h-9 rounded-lg px-3 text-xs text-white disabled:opacity-35">{t("common.undo", { defaultValue: "Undo" })}</button>
              <button type="button" disabled={!textHistory.canRedo} onClick={textHistory.redo} className="min-h-9 rounded-lg px-3 text-xs text-white disabled:opacity-35">{t("common.redo", { defaultValue: "Redo" })}</button>
              {(["upper", "lower", "title"] as const).map(mode => <button type="button" key={mode} onClick={() => applyTextCase(mode)} className="min-h-9 rounded-lg px-3 text-xs text-white hover:bg-white/10">{t(`editor.text.case.${mode}`, { defaultValue: ({ upper: "UPPERCASE", lower: "lowercase", title: "Title Case" })[mode] })}</button>)}
              <button type="button" onClick={() => { finishTextEditing(); draftFocus.finish(); }} className="min-h-9 rounded-lg bg-white px-3 text-xs text-black">{t("common.done")}</button>
            </div>
            <textarea
              dir={editingText?.direction ?? "auto"}
              ref={textInput}
              wrap={editingText.maxWidth ? "soft" : "off"}
              autoFocus
              value={editingText.text}
              aria-label={t("editor.menu.editText")}
              onChange={(e) => textHistory.change(e.target.value)}
              onBlur={event => { if (!(event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-inline-text-tools]"))) finishTextEditing(); }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if ((e.metaKey || e.ctrlKey) && ["z", "y"].includes(e.key.toLowerCase())) {
                  e.preventDefault(); e.stopPropagation();
                  if (e.key.toLowerCase() === "y" || e.shiftKey) textHistory.redo(); else textHistory.undo();
                }
                if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                  e.preventDefault(); e.stopPropagation(); finishTextEditing(); draftFocus.finish();
                }
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
                width: `${Math.max(80, (editingText.maxWidth ? editingText.maxWidth * settings.width : selBox?.w ?? 200) * scale + 12)}px`,
                maxWidth: "calc(100% - 12px)",
                maxHeight: "calc(100% - 24px)",
                overflow: "auto",
                lineHeight: editingText.lineHeight ?? 1.2,
                letterSpacing: `${(editingText.letterSpacing ?? 0) / 1080 * settings.height * scale}px`,
                textDecorationLine: [editingText.underline ? "underline" : "", editingText.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none",
                caretColor: "#fff",
              }}
              rows={Math.max(1, editingText.text.split("\n").length)}
            />
          </>)}
        </div>
      </div>


      {overlapIds && <OverlapLayerPicker project={{ clips, tracks }} ids={overlapIds} selectedId={selectedClipIds[0] ?? null} onSelect={id => selectClip(id)} onClose={() => setOverlapIds(null)} />}
      <div role="toolbar" aria-label={t("editor.viewport.toolbar", { defaultValue: "Canvas navigation" })} className="flex shrink-0 items-center justify-end gap-2 overflow-x-auto whitespace-nowrap border-t border-white/10 bg-neutral-950 px-3 py-1.5 text-xs text-white/70 [&>button]:shrink-0 [&>span]:shrink-0">
        <button type="button" onClick={() => { onGestureEnd(); finishTextEditing(); draftFocus.finish(); viewportCleanup.current?.(); setCroppingId(null); setNavigating(false); setEditingGuides(false); useEditorStore.getState().setIsPlaying(false); setPresenting(true); }} className="mr-auto min-h-8 rounded-lg border border-white/20 px-3">{t("editor.present.title", { defaultValue: "Present pages" })}</button>
        <button type="button" aria-pressed={editingGuides} onClick={() => { onGestureEnd(); finishTextEditing(); draftFocus.finish(); viewportCleanup.current?.(); setCroppingId(null); setNavigating(false); useEditorUiStore.getState().setDraw(null); useEditorStore.getState().setIsPlaying(false); setEditingGuides(value => !value); }} className={`min-h-8 rounded-lg border px-3 ${editingGuides ? "border-cyan-300 bg-cyan-300/15" : "border-white/20"}`}>{t(editingGuides ? "editor.guides.done" : "editor.guides.edit", { defaultValue: editingGuides ? "Done guides" : "Edit guides" })}</button>
        <button type="button" aria-pressed={navigating} onClick={() => { onGestureEnd(); setEditingGuides(false); setCroppingId(null); if (!navigating) useEditorUiStore.getState().setDraw(null); setNavigating(value => !value); }} className={`min-h-8 rounded-lg border px-3 ${navigating ? "border-white bg-white/15" : "border-white/20"}`}>{t("editor.viewport.pan", { defaultValue: "Pan canvas" })}</button>
        <button type="button" aria-label={t("editor.viewport.zoomOut", { defaultValue: "Zoom canvas out" })} onClick={() => setViewport(before => zoomDesignViewport(before, before.zoom / 1.2))} className="min-h-8 min-w-8 rounded-lg border border-white/20">−</button>
        <span className="min-w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" aria-label={t("editor.viewport.zoomIn", { defaultValue: "Zoom canvas in" })} onClick={() => setViewport(before => zoomDesignViewport(before, before.zoom * 1.2))} className="min-h-8 min-w-8 rounded-lg border border-white/20">+</button>
        {([-1, 1] as const).map(direction => <button type="button" key={direction} disabled={editingGuides || sampling || !!editingTextId || !!draw} onClick={() => { onGestureEnd(); const store = useEditorStore.getState(), next = nextDesignLayer(store.toSnapshot(), store.currentTime, store.selectedClipIds, direction); if (next) { store.setIsPlaying(false); store.selectClip(next); } }} title={t(direction === -1 ? "editor.layers.previousShortcut" : "editor.layers.nextShortcut", { defaultValue: direction === -1 ? "Previous layer (Alt+PageUp)" : "Next layer (Alt+PageDown)" })} className="min-h-8 rounded-lg border border-white/20 px-3 disabled:opacity-35">{t(direction === -1 ? "editor.layers.previousLayer" : "editor.layers.nextLayer", { defaultValue: direction === -1 ? "Previous layer" : "Next layer" })}</button>)}
        <button type="button" disabled={!selectedClip || editingGuides || sampling || !!editingTextId} onClick={() => { if (!selBox) return; onGestureEnd(); useEditorStore.getState().setIsPlaying(false); setOverlapIds(layersAt().filter(layer => pointInBox(layer.box, selBox.cx, selBox.cy)).reverse().map(layer => layer.clip.id)); }} title={t("editor.layers.overlapShortcut", { defaultValue: "Ctrl or Command + click cycles overlapping layers" })} className="min-h-8 rounded-lg border border-white/20 px-3 disabled:opacity-35">{t("editor.layers.overlapping", { defaultValue: "Overlapping layers" })}</button>
        <button type="button" disabled={!selectedClipIds.length} onClick={focusSelection} title={t("editor.viewport.selectionShortcut", { defaultValue: "Zoom to selection (Shift+2)" })} className="min-h-8 rounded-lg border border-white/20 px-3 disabled:opacity-35">{t("editor.viewport.selection", { defaultValue: "Selection" })}</button>
        <button type="button" title={t("editor.viewport.fitShortcut", { defaultValue: "Fit page (Shift+1)" })} onClick={() => { viewportCleanup.current?.(); setViewport(FIT_VIEWPORT); }} className="min-h-8 rounded-lg border border-white/20 px-3">{t("editor.viewport.fit", { defaultValue: "Fit" })}</button>
      </div>
      <PagesStrip sources={sources} />

      <div className="flex min-w-0 items-center gap-1 border-t border-white/10 bg-black/60 px-2 py-2.5 backdrop-blur-[24px] sm:gap-3 sm:px-4">
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
        {([-1, 1] as const).map(direction => (
          <Button key={direction} size="icon" variant="ghost"
            onClick={() => { const state = useEditorStore.getState(); setIsPlaying(false); setCurrentTime(stepTimelineFrame(state.currentTime, direction, state.settings.fps, selectTimelineDuration(state))); }}
            className="h-8 w-8 shrink-0 rounded-md text-white/80 hover:bg-white/10"
            aria-label={direction === -1 ? t("editor.canvas.previousFrame") : t("editor.canvas.nextFrame")}
            title={direction === -1 ? t("editor.canvas.previousFrame") : t("editor.canvas.nextFrame")}
            disabled={duration <= 0 || (direction === -1 ? currentTime <= 0 : currentTime >= duration)}>
            {direction === -1 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ))}
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
          aria-label={t("editor.canvas.playhead")}
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
  overlapCount,
  onPickLayers,
}: {
  clip: Clip | null;
  onEdit: (id: string) => void;
  overlapCount: number;
  onPickLayers: () => void;
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
      {overlapCount > 1 && <><ContextMenuItem onSelect={onPickLayers}>{t("editor.layers.overlapping", { defaultValue: "Overlapping layers" })}</ContextMenuItem><ContextMenuSeparator className="bg-white/10" /></>}
      {clip.kind === "text" && (
        <>
          <ContextMenuItem onSelect={() => onEdit(clip.id)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> {t("editor.menu.editText")}
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-white/10" />
        </>
      )}
      {mediaClip && !mediaClip.videoMatte && (
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
