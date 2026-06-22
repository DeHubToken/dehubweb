/**
 * Canvas-based preview compositor. Composites all active clips at the playhead
 * (video frames + images + text overlays) and synchronises audio elements.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Repeat, Type, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";
import type { Clip, MediaClip, TextClip } from "@/lib/editor/types";

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
        v.src = m.url;
        v.crossOrigin = "anonymous";
        v.muted = true; // audio handled separately via audioPool when needed
        v.playsInline = true;
        v.preload = "auto";
        vPool.set(m.id, v);
      }
      if (m.kind === "audio" && !aPool.has(m.id)) {
        const a = new Audio(m.url);
        a.preload = "auto";
        aPool.set(m.id, a);
      }
      if (m.kind === "image" && !iPool.has(m.id)) {
        const img = new Image();
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

      // Determine active clips.
      const active = state.clips.filter((c) => t >= c.start && t < c.start + c.duration);

      // Sync video/audio media.
      const activeVideoMediaIds = new Set<string>();
      const activeAudioMediaIds = new Set<string>();

      for (const c of active) {
        if (c.kind === "video" || c.kind === "audio") {
          const localT = (c as MediaClip).trimIn + (t - c.start);
          if (c.kind === "video") {
            const v = videoPool.current.get((c as MediaClip).mediaId);
            if (v) {
              activeVideoMediaIds.add((c as MediaClip).mediaId);
              if (state.isPlaying) {
                if (Math.abs(v.currentTime - localT) > 0.25) v.currentTime = localT;
                if (v.paused) { void v.play().catch(() => undefined); }
              } else {
                if (!v.paused) v.pause();
                if (Math.abs(v.currentTime - localT) > 0.03) v.currentTime = localT;
              }
            }
          } else {
            const a = audioPool.current.get((c as MediaClip).mediaId);
            const track = state.tracks.find((tr) => tr.id === c.trackId);
            if (a) {
              activeAudioMediaIds.add((c as MediaClip).mediaId);
              a.muted = !!track?.muted;
              if (state.isPlaying) {
                if (Math.abs(a.currentTime - localT) > 0.25) a.currentTime = localT;
                if (a.paused) { void a.play().catch(() => undefined); }
              } else {
                if (!a.paused) a.pause();
                if (Math.abs(a.currentTime - localT) > 0.03) a.currentTime = localT;
              }
            }
          }
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

          // Sort visible clips by track index then by kind priority (video < image < text).
          const visible = active
            .filter((c) => {
              const tr = state.tracks.find((x) => x.id === c.trackId);
              return tr && !tr.hidden && tr.kind !== "audio";
            })
            .sort((a, b) => trackZ(a.trackId) - trackZ(b.trackId));

          for (const c of visible) {
            drawClip(ctx, canvas, c, t, videoPool.current, imagePool.current);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracks, clips, settings]);

  // ── Layout: scale canvas to fit ──
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const pad = 24;
      const aw = wrap.clientWidth - pad * 2;
      const ah = wrap.clientHeight - pad * 2;
      const s = Math.min(aw / settings.width, ah / settings.height);
      setScale(Math.max(0.05, s));
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [settings.width, settings.height]);

  // ── Click-to-select & drag text overlays on canvas ──
  const selectedTextClip = useMemo(() => {
    const id = selectedClipIds[0];
    const c = clips.find((x) => x.id === id);
    return c && c.kind === "text" ? (c as TextClip) : null;
  }, [selectedClipIds, clips]);

  const draggingRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedTextClip) return;
    const t = currentTime;
    if (t < selectedTextClip.start || t > selectedTextClip.start + selectedTextClip.duration) return;
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    draggingRef.current = { id: selectedTextClip.id, dx: nx - selectedTextClip.x, dy: ny - selectedTextClip.y };
    window.addEventListener("mousemove", onWindowMove);
    window.addEventListener("mouseup", onWindowUp);
  };
  const onWindowMove = (e: MouseEvent) => {
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
    window.removeEventListener("mousemove", onWindowMove);
    window.removeEventListener("mouseup", onWindowUp);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-black">
      <div
        ref={wrapRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.04),_transparent_70%)] p-6"
      >
        <div
          style={{
            width: settings.width * scale,
            height: settings.height * scale,
            background: settings.background,
          }}
          className="relative overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10"
        >
          <canvas
            ref={canvasRef}
            width={settings.width}
            height={settings.height}
            onMouseDown={onCanvasMouseDown}
            className={cn(
              "h-full w-full",
              selectedTextClip ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-[24px]">
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
          onClick={() => addTextClip()}
          className="h-8 rounded-md text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Type className="mr-1.5 h-4 w-4" /> Add text
        </Button>
        <span className="w-32 text-xs tabular-nums text-white/70">
          {fmtTime(currentTime, settings.fps)} / {fmtTime(duration, settings.fps)}
        </span>
        <Slider
          value={[Math.min(currentTime, duration || 0)]}
          min={0}
          max={Math.max(duration, 0.01)}
          step={1 / settings.fps}
          onValueChange={(v) => { setIsPlaying(false); setCurrentTime(v[0] ?? 0); }}
          className="flex-1"
          disabled={duration <= 0}
        />
      </div>
    </section>
  );
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clip: Clip,
  t: number,
  vPool: Map<string, HTMLVideoElement>,
  iPool: Map<string, HTMLImageElement>,
) {
  if (clip.kind === "video") {
    const v = vPool.get(clip.mediaId);
    if (!v || !v.videoWidth) return;
    drawContain(ctx, v, v.videoWidth, v.videoHeight, canvas.width, canvas.height);
  } else if (clip.kind === "image") {
    const img = iPool.get(clip.mediaId);
    if (!img || !img.naturalWidth) return;
    drawContain(ctx, img, img.naturalWidth, img.naturalHeight, canvas.width, canvas.height);
  } else if (clip.kind === "text") {
    const text = clip as TextClip;
    // Simple fade in/out (first/last 0.3s).
    const FADE = 0.3;
    const into = t - text.start;
    const outof = text.start + text.duration - t;
    const alpha = Math.max(0, Math.min(1, Math.min(into / FADE, outof / FADE, 1)));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = text.color;
    const size = (text.fontSize / 1080) * canvas.height;
    ctx.font = `${text.fontWeight} ${size}px ${text.fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = text.align === "centre" ? "center" : text.align;
    const x = text.x * canvas.width;
    const y = text.y * canvas.height;
    // Multi-line support.
    const lines = text.text.split(/\n/);
    const lh = size * 1.2;
    const startY = y - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, x, startY + i * lh));
    ctx.restore();
  }
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
