/**
 * Canvas-based preview compositor. Composites all active clips at the playhead
 * (video frames + images + text overlays) and synchronises audio elements.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Repeat, Type, RotateCcw, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown, Copy, Trash2, Pencil } from "lucide-react";
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
import type { Clip, MediaClip, TextClip } from "@/lib/editor/types";
import { computeRenderOps, type RenderOp } from "@/lib/editor/transitions";
import { TEXT_DRAG_MIME, type TextPreset } from "@/lib/editor/textPresets";

function fmtTime(t: number, fps: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const total = Math.floor(t);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const f = Math.floor((t - total) * fps);
  return `${m}:${s.toString().padStart(2, "0")}.${f.toString().padStart(2, "0")}`;
}

export function Compositor() {
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
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectClip = useEditorStore((s) => s.selectClip);
  const updateTextClip = useEditorStore((s) => s.updateTextClip);
  const duration = useEditorStore(selectTimelineDuration);

  // ── Element pools ──
  const videoPool = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioPool = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imagePool = useRef<Map<string, HTMLImageElement>>(new Map());

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

  // ── Render loop ──
  useEffect(() => {
    let raf = 0;
    const trackZ = (trackId: string) => {
      const idx = tracks.findIndex((t) => t.id === trackId);
      return idx < 0 ? 0 : idx;
    };

    const tick = () => {
      // Advance playhead.
      const state = useEditorStore.getState();
      let t = state.currentTime;
      if (state.isPlaying && playStartedRef.current) {
        t = playStartedRef.current.time + (performance.now() - playStartedRef.current.wall) / 1000;
        const dur = selectTimelineDuration(state);
        if (dur > 0 && t >= dur) {
          if (state.isLooping) {
            playStartedRef.current = { wall: performance.now(), time: 0 };
            t = 0;
          } else {
            t = dur;
            state.setIsPlaying(false);
          }
        }
        state.setCurrentTime(t);
      }

      // Determine active clips (audio still uses simple active set; visuals use render-ops).
      const active = state.clips.filter((c) => t >= c.start && t < c.start + c.duration);

      // Compute visual render ops (covers normal + outgoing + incoming-preroll transitions).
      const isVisualTrack = (trackId: string) => {
        const tr = state.tracks.find((x) => x.id === trackId);
        return !!tr && !tr.hidden && tr.kind !== "audio";
      };
      const renderOps: RenderOp[] = computeRenderOps(
        state.clips,
        isVisualTrack,
        t,
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
          op.localTimeOverride !== undefined ? op.localTimeOverride : mc.trimIn + (t - mc.start) * speed;
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
        const localT = mc.trimIn + (t - mc.start) * speed;
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
        if (canvas.width !== state.settings.width) canvas.width = state.settings.width;
        if (canvas.height !== state.settings.height) canvas.height = state.settings.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = state.settings.background;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Sort by track index then preserve op order (so incoming draws over outgoing where alpha overlaps).
          const ordered = renderOps.slice().sort(
            (a, b) => trackZ(a.clip.trackId) - trackZ(b.clip.trackId),
          );

          for (const op of ordered) {
            ctx.save();
            if (op.translateX) ctx.translate(op.translateX, 0);
            if (op.clipRect) {
              ctx.beginPath();
              ctx.rect(op.clipRect.x, 0, op.clipRect.w, canvas.height);
              ctx.clip();
            }
            ctx.globalAlpha = op.alpha;
            drawClip(ctx, canvas, op.clip, t, videoPool.current, imagePool.current);
            ctx.restore();
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracks, clips, settings]);

  // ── Layout: scale canvas to fit (sync initial measurement + observer) ──
  const [scale, setScale] = useState(0);
  const PAD = 24;
  const measure = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const aw = Math.max(0, wrap.clientWidth - PAD * 2);
    const ah = Math.max(0, wrap.clientHeight - PAD * 2);
    if (aw <= 0 || ah <= 0) return;
    const s = Math.min(aw / settings.width, ah / settings.height);
    setScale(Math.max(0.01, s));
  };
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.width, settings.height]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.width, settings.height]);

  // ── Canvas interactions: hit-test, click-select, drag, right-click, drop ──
  const trackZIndex = useCallback(
    (trackId: string) => {
      const i = tracks.findIndex((t) => t.id === trackId);
      return i < 0 ? -1 : i;
    },
    [tracks],
  );

  const activeTextClips = useMemo(() => {
    return clips
      .filter((c): c is TextClip =>
        c.kind === "text" && currentTime >= c.start && currentTime <= c.start + c.duration,
      )
      .sort((a, b) => trackZIndex(a.trackId) - trackZIndex(b.trackId));
  }, [clips, currentTime, trackZIndex]);

  const hitTestText = useCallback(
    (clientX: number, clientY: number): TextClip | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cx = ((clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((clientY - rect.top) / rect.height) * canvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // Iterate top-down (last drawn is on top).
      for (let i = activeTextClips.length - 1; i >= 0; i--) {
        const text = activeTextClips[i];
        const size = (text.fontSize / 1080) * canvas.height;
        ctx.save();
        ctx.font = `${text.fontWeight} ${size}px ${text.fontFamily}`;
        const lines = text.text.split(/\n/);
        const lh = size * 1.2;
        const widths = lines.map((ln) => ctx.measureText(ln).width);
        ctx.restore();
        const pad = text.background ? (text.background.padding / 1080) * canvas.height : size * 0.35;
        const boxW = Math.max(...widths, 1) + pad * 2;
        const boxH = lines.length * lh + pad * 2;
        const x = text.x * canvas.width;
        const y = text.y * canvas.height;
        let bx = x - pad;
        if (text.align === "centre") bx = x - boxW / 2;
        else if (text.align === "right") bx = x - boxW + pad;
        const by = y - boxH / 2;
        if (cx >= bx && cx <= bx + boxW && cy >= by && cy <= by + boxH) {
          return text;
        }
      }
      return null;
    },
    [activeTextClips],
  );

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const editingText = useMemo(() => {
    if (!editingTextId) return null;
    const c = clips.find((x) => x.id === editingTextId);
    return c && c.kind === "text" ? (c as TextClip) : null;
  }, [editingTextId, clips]);

  const selectedTextClip = useMemo(() => {
    const id = selectedClipIds[0];
    const c = clips.find((x) => x.id === id);
    return c && c.kind === "text" ? (c as TextClip) : null;
  }, [selectedClipIds, clips]);

  const draggingRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingTextId) return;
    if (e.button !== 0) return;
    const hit = hitTestText(e.clientX, e.clientY);
    if (!hit) {
      selectClip(null);
      return;
    }
    if (selectedClipIds[0] !== hit.id) selectClip(hit.id);
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    draggingRef.current = { id: hit.id, dx: nx - hit.x, dy: ny - hit.y };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
  };
  const onWindowMove = (e: PointerEvent) => {
    const d = draggingRef.current;
    const c = canvasRef.current;
    if (!d || !c) return;
    const rect = c.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    updateTextClip(d.id, {
      x: Math.max(0, Math.min(1, nx - d.dx)),
      y: Math.max(0, Math.min(1, ny - d.dy)),
    });
  };
  const onWindowUp = () => {
    draggingRef.current = null;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onWindowUp);
  };
  const onCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTestText(e.clientX, e.clientY);
    if (hit) {
      selectClip(hit.id);
      setEditingTextId(hit.id);
    }
  };
  const onCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTestText(e.clientX, e.clientY);
    if (hit) selectClip(hit.id);
    else selectClip(null);
  };

  // ── Drag-and-drop text presets onto the canvas ──
  const [isDropTarget, setIsDropTarget] = useState(false);
  const onSurfaceDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(TEXT_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDropTarget(true);
    }
  };
  const onSurfaceDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDropTarget(false);
  };
  const onSurfaceDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(TEXT_DRAG_MIME);
    setIsDropTarget(false);
    if (!raw) return;
    e.preventDefault();
    let preset: TextPreset | null = null;
    try { preset = JSON.parse(raw) as TextPreset; } catch { /* noop */ }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const id = addTextClip();
    updateTextClip(id, {
      x: nx,
      y: ny,
      ...(preset
        ? { text: preset.text, fontSize: preset.fontSize, fontWeight: preset.fontWeight }
        : {}),
    });
  };

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
            "relative col-start-1 row-start-1 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 transition",
            isDropTarget && "ring-2 ring-white/70",
          )}
        >
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
                  editingTextId ? "cursor-text" : selectedTextClip ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                )}
              />
            </ContextMenuTrigger>
            <CanvasContextMenu
              textClip={selectedTextClip}
              onEdit={(id) => setEditingTextId(id)}
            />
          </ContextMenu>
          {isDropTarget && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/[0.03]">
              <div className="rounded-lg border border-dashed border-white/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-white/90 backdrop-blur-[8px]">
                Drop to add text
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
                fontSize: `${(editingText.fontSize / 1080) * settings.height * scale}px`,
                textAlign: editingText.align === "centre" ? "center" : editingText.align,
                background: "transparent",
                border: "1px dashed rgba(255,255,255,0.6)",
                borderRadius: 4,
                padding: "2px 6px",
                outline: "none",
                resize: "none",
                minWidth: 80,
                lineHeight: 1.2,
                caretColor: "#fff",
              }}
              rows={Math.max(1, editingText.text.split("\n").length)}
            />
          )}
        </div>
      </div>


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
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={duration <= 0}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => { setIsPlaying(false); setCurrentTime(0); }}
          className="h-8 w-8 rounded-md text-white/80 hover:bg-white/10"
          aria-label="Reset to start"
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
          aria-label="Toggle loop"
        >
          <Repeat className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            addTextClip();
            // Surface the inspector on small screens.
            try { window.dispatchEvent(new CustomEvent("editor:open-inspector")); } catch { /* noop */ }
          }}
          className="h-8 rounded-md text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Type className="mr-1.5 h-4 w-4" /> Add text
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
      </div>
    </section>
  );
}

function CanvasContextMenu({
  textClip,
  onEdit,
}: {
  textClip: TextClip | null;
  onEdit: (id: string) => void;
}) {
  const moveTrack = useEditorStore((s) => s.moveTrack);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const rippleDelete = useEditorStore((s) => s.rippleDelete);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const tracks = useEditorStore((s) => s.tracks);

  if (!textClip) {
    return (
      <ContextMenuContent className="w-52 border-white/10 bg-black/85 text-white backdrop-blur-[24px]">
        <ContextMenuItem onSelect={() => addTextClip()}>
          <Type className="mr-2 h-3.5 w-3.5" /> Add text
        </ContextMenuItem>
      </ContextMenuContent>
    );
  }

  const idx = tracks.findIndex((t) => t.id === textClip.trackId);
  const canForward = idx >= 0 && idx < tracks.length - 1;
  const canBackward = idx > 0;

  return (
    <ContextMenuContent className="w-56 border-white/10 bg-black/85 text-white backdrop-blur-[24px]">
      <ContextMenuItem onSelect={() => onEdit(textClip.id)}>
        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit text
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-white/10" />
      <ContextMenuItem disabled={!canForward} onSelect={() => moveTrack(textClip.trackId, "front")}>
        <ChevronsUp className="mr-2 h-3.5 w-3.5" /> Bring to front
      </ContextMenuItem>
      <ContextMenuItem disabled={!canForward} onSelect={() => moveTrack(textClip.trackId, "forward")}>
        <ChevronUp className="mr-2 h-3.5 w-3.5" /> Bring forward
      </ContextMenuItem>
      <ContextMenuItem disabled={!canBackward} onSelect={() => moveTrack(textClip.trackId, "backward")}>
        <ChevronDown className="mr-2 h-3.5 w-3.5" /> Send backward
      </ContextMenuItem>
      <ContextMenuItem disabled={!canBackward} onSelect={() => moveTrack(textClip.trackId, "back")}>
        <ChevronsDown className="mr-2 h-3.5 w-3.5" /> Send to back
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-white/10" />
      <ContextMenuItem onSelect={() => duplicateSelected()}>
        <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => rippleDelete([textClip.id])}
        className="text-red-300 focus:text-red-200"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function cssFilterFor(clip: Clip): string {
  if (clip.kind !== "video" && clip.kind !== "image") return "none";
  const e = (clip as MediaClip).effects;
  if (!e) return "none";
  const parts: string[] = [];
  if (e.brightness !== undefined && e.brightness !== 1) parts.push(`brightness(${e.brightness})`);
  if (e.contrast !== undefined && e.contrast !== 1) parts.push(`contrast(${e.contrast})`);
  if (e.saturation !== undefined && e.saturation !== 1) parts.push(`saturate(${e.saturation})`);
  if (e.blur !== undefined && e.blur > 0) parts.push(`blur(${e.blur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clip: Clip,
  t: number,
  vPool: Map<string, HTMLVideoElement>,
  iPool: Map<string, HTMLImageElement>,
) {
  const prevFilter = ctx.filter;
  ctx.filter = cssFilterFor(clip);
  if (clip.kind === "video") {
    const v = vPool.get(clip.mediaId);
    if (v && v.videoWidth) drawContain(ctx, v, v.videoWidth, v.videoHeight, canvas.width, canvas.height);
  } else if (clip.kind === "image") {
    const img = iPool.get(clip.mediaId);
    if (img && img.naturalWidth) drawContain(ctx, img, img.naturalWidth, img.naturalHeight, canvas.width, canvas.height);
  } else if (clip.kind === "text") {
    const text = clip as TextClip;
    const FADE = 0.3;
    const into = t - text.start;
    const outof = text.start + text.duration - t;
    const alpha = Math.max(0, Math.min(1, Math.min(into / FADE, outof / FADE, 1)));
    ctx.save();
    ctx.globalAlpha = alpha;
    const size = (text.fontSize / 1080) * canvas.height;
    ctx.font = `${text.fontWeight} ${size}px ${text.fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = text.align === "centre" ? "center" : text.align;
    const x = text.x * canvas.width;
    const y = text.y * canvas.height;
    const lines = text.text.split(/\n/);
    const lh = size * 1.2;
    const startY = y - ((lines.length - 1) * lh) / 2;

    // Optional background pill.
    if (text.background && text.background.opacity > 0) {
      const pad = (text.background.padding / 1080) * canvas.height;
      const radius = Math.max(0, (text.background.radius / 1080) * canvas.height);
      const widths = lines.map((ln) => ctx.measureText(ln).width);
      const boxW = Math.max(...widths, 1) + pad * 2;
      const boxH = lines.length * lh + pad * 2;
      let bx = x - pad;
      if (text.align === "centre") bx = x - boxW / 2;
      else if (text.align === "right") bx = x - boxW + pad;
      const by = startY - lh / 2 - pad;
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = prevAlpha * text.background.opacity;
      ctx.fillStyle = text.background.color;
      roundRectPath(ctx, bx, by, boxW, boxH, radius);
      ctx.fill();
      ctx.globalAlpha = prevAlpha;
    }

    // Optional stroke.
    if (text.stroke && text.stroke.width > 0) {
      ctx.lineWidth = (text.stroke.width / 1080) * canvas.height;
      ctx.strokeStyle = text.stroke.color;
      ctx.lineJoin = "round";
      lines.forEach((ln, i) => ctx.strokeText(ln, x, startY + i * lh));
    }

    ctx.fillStyle = text.color;
    lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lh));
    ctx.restore();
  }
  ctx.filter = prevFilter;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  const x = (dw - w) / 2;
  const y = (dh - h) / 2;
  ctx.drawImage(src, x, y, w, h);
}
