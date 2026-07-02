/**
 * Multi-track timeline. Ruler + draggable playhead + tracks lanes with clips.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Scissors, Trash2, Volume2, VolumeX, Eye, EyeOff, X, ArrowLeftRight, Film, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";
import type { Clip, Track } from "@/lib/editor/types";
import {
  DEFAULT_TRANSITION_DURATION,
  MAX_TRANSITION_DURATION,
  MIN_TRANSITION_DURATION,
  TRANSITION_OPTIONS,
  findAdjacentNext,
  maxTransitionFor,
} from "@/lib/editor/transitions";

const TRACK_HEIGHT = 56;
const HEADER_WIDTH = 120;
const RULER_HEIGHT = 28;
const SNAP_PX = 8;

function fmtRuler(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function Timeline() {
  const tracks = useEditorStore((s) => s.tracks);
  const clips = useEditorStore((s) => s.clips);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const rippleDelete = useEditorStore((s) => s.rippleDelete);
  const addTrack = useEditorStore((s) => s.addTrack);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectClip = useEditorStore((s) => s.selectClip);
  const moveClip = useEditorStore((s) => s.moveClip);
  const trimClip = useEditorStore((s) => s.trimClip);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);
  const updateMutate = useEditorStore;
  const duration = useEditorStore(selectTimelineDuration);

  const scrollRef = useRef<HTMLDivElement>(null);
  const totalSeconds = Math.max(30, duration + 10);
  const contentWidth = Math.ceil(totalSeconds * zoom);

  // ── Snap helpers ──
  const snapTargets = useMemo(() => {
    const set = new Set<number>([0, currentTime]);
    for (const c of clips) {
      set.add(c.start);
      set.add(c.start + c.duration);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [clips, currentTime]);

  const maybeSnap = useCallback(
    (timeSec: number, ignoreIds: Set<string>): number => {
      const tolSec = SNAP_PX / zoom;
      let best = timeSec;
      let bestDist = tolSec;
      for (const t of snapTargets) {
        const d = Math.abs(t - timeSec);
        if (d < bestDist) {
          best = t;
          bestDist = d;
        }
      }
      // Also snap to other clips' edges (handled above as we include them).
      void ignoreIds;
      return best;
    },
    [snapTargets, zoom],
  );

  // ── Playhead scrub ──
  const isScrubbingRef = useRef(false);
  const onRulerDown = (e: React.PointerEvent) => {
    isScrubbingRef.current = true;
    setIsPlaying(false);
    onScrub(e.clientX);
    window.addEventListener("pointermove", onScrubWin);
    window.addEventListener("pointerup", onScrubUp);
  };
  const onScrub = (clientX: number) => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const px = clientX - rect.left + wrap.scrollLeft - HEADER_WIDTH;
    const t = Math.max(0, px / zoom);
    setCurrentTime(t);
  };
  const onScrubWin = (e: PointerEvent) => { if (isScrubbingRef.current) onScrub(e.clientX); };
  const onScrubUp = () => {
    isScrubbingRef.current = false;
    window.removeEventListener("pointermove", onScrubWin);
    window.removeEventListener("pointerup", onScrubUp);
  };

  // ── Drop from media panel ──
  const onLaneDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-dehub-media")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onLaneDrop = (e: React.DragEvent, track: Track) => {
    const raw = e.dataTransfer.getData("application/x-dehub-media");
    if (!raw) return;
    e.preventDefault();
    let mediaId: string | null = null;
    try { mediaId = JSON.parse(raw)?.mediaId ?? null; } catch { /* noop */ }
    if (!mediaId) return;
    const wrap = scrollRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const px = e.clientX - rect.left + wrap.scrollLeft - HEADER_WIDTH;
    const start = Math.max(0, px / zoom);
    addClipFromMedia(mediaId, track.id, start);
  };

  // ── Marquee deselect by clicking empty area ──
  const onLanesBackgroundDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) selectClip(null);
  };

  // ── Ruler ticks ──
  const ticks = useMemo(() => {
    const step =
      zoom > 200 ? 0.25 :
      zoom > 100 ? 0.5 :
      zoom > 50 ? 1 :
      zoom > 25 ? 2 :
      zoom > 12 ? 5 : 10;
    const out: number[] = [];
    for (let t = 0; t <= totalSeconds + step / 2; t += step) out.push(t);
    return { step, out };
  }, [zoom, totalSeconds]);

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-white/10 bg-black/70 backdrop-blur-[24px]">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={() => splitAtPlayhead()}
          className="h-7 rounded-md px-2 text-white/80 hover:bg-white/10 hover:text-white">
          <Scissors className="mr-1 h-3.5 w-3.5" /> Split
        </Button>
        <Button size="sm" variant="ghost"
          onClick={() => rippleDelete()}
          disabled={!selectedClipIds.length}
          className="h-7 rounded-md px-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
        <div className="mx-2 h-4 w-px bg-white/10" />
        <Button size="sm" variant="ghost" onClick={() => addTrack("video")}
          className="h-7 rounded-md px-2 text-white/80 hover:bg-white/10 hover:text-white">
          <Plus className="mr-1 h-3.5 w-3.5" /> Video&nbsp;
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addTrack("audio")}
          className="h-7 rounded-md px-2 text-white/80 hover:bg-white/10 hover:text-white">
          <Plus className="mr-1 h-3.5 w-3.5" /> Audio
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setZoom(zoom / 1.25)}
            className="h-7 w-7 rounded-md text-white/80 hover:bg-white/10 hover:text-white" aria-label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-[10px] tabular-nums text-white/50">{Math.round(zoom)}px/s</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom(zoom * 1.25)}
            className="h-7 w-7 rounded-md text-white/80 hover:bg-white/10 hover:text-white" aria-label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto">
        <div style={{ width: HEADER_WIDTH + contentWidth }}>
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 z-30 shrink-0 border-r border-white/10 bg-black/80"
              style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }} />
            <div
              onPointerDown={onRulerDown}
              className="relative cursor-ew-resize touch-none select-none border-b border-white/10 bg-black/80"
              style={{ width: contentWidth, height: RULER_HEIGHT }}
            >
              {ticks.out.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * zoom }}>
                  <div className="h-2 w-px bg-white/20" />
                  <div className="mt-0.5 text-[9px] tabular-nums text-white/40">{fmtRuler(t)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tracks */}
          <div onMouseDown={onLanesBackgroundDown}>
            {tracks.map((tr) => (
              <div key={tr.id} className="flex border-b border-white/5" style={{ height: TRACK_HEIGHT }}>
                <TrackHeader track={tr} />
                <div
                  onDragOver={onLaneDragOver}
                  onDrop={(e) => onLaneDrop(e, tr)}
                  className="relative shrink-0"
                  style={{ width: contentWidth, height: TRACK_HEIGHT }}
                >
                  {/* Lane grid lines every second when zoom is high enough */}
                  {zoom >= 40 && Array.from({ length: Math.floor(totalSeconds) + 1 }).map((_, i) => (
                    <div key={i} className="absolute top-0 h-full w-px bg-white/[0.03]"
                      style={{ left: i * zoom }} />
                  ))}
                  {clips
                    .filter((c) => c.trackId === tr.id)
                    .map((c) => (
                      <ClipBlock
                        key={c.id}
                        clip={c}
                        track={tr}
                        zoom={zoom}
                        selected={selectedClipIds.includes(c.id)}
                        onSelect={(additive) => selectClip(c.id, additive)}
                        onMove={(delta, targetTrackId) => {
                          const snapped = maybeSnap(c.start + delta, new Set([c.id]));
                          moveClip(c.id, { start: snapped, trackId: targetTrackId });
                        }}
                        onTrim={(edge, deltaSec) => trimClip(c.id, edge, deltaSec)}
                        tracks={tracks}
                        scrollRef={scrollRef}
                        snapToTime={(time) => maybeSnap(time, new Set([c.id]))}
                        setIsPlaying={setIsPlaying}
                        store={updateMutate}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Playhead */}
        <Playhead
          time={currentTime}
          zoom={zoom}
          headerWidth={HEADER_WIDTH}
          rulerHeight={RULER_HEIGHT}
        />
      </div>
    </section>
  );
}

function TrackHeader({ track }: { track: Track }) {
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const tracksLen = useEditorStore((s) => s.tracks.length);
  const setTracks = useEditorStore;
  const toggleMute = () => {
    const s = setTracks.getState();
    setTracks.setState({
      tracks: s.tracks.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t)),
    });
  };
  const toggleHide = () => {
    const s = setTracks.getState();
    setTracks.setState({
      tracks: s.tracks.map((t) => (t.id === track.id ? { ...t, hidden: !t.hidden } : t)),
    });
  };
  const kindLabel = track.kind === "video" ? "V" : track.kind === "audio" ? "A" : "T";
  return (
    <div
      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-white/10 bg-black/80 px-2"
      style={{ width: HEADER_WIDTH }}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[10px] font-semibold text-white/80">
        {kindLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-white/80" title={track.name}>{track.name}</span>
      <button onClick={track.kind === "audio" ? toggleMute : toggleHide}
        className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white"
        aria-label={track.kind === "audio" ? "Toggle mute" : "Toggle hidden"}>
        {track.kind === "audio"
          ? (track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />)
          : (track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />)}
      </button>
      {tracksLen > 1 && (
        <button onClick={() => removeTrack(track.id)}
          className="rounded p-0.5 text-white/30 hover:bg-white/10 hover:text-white"
          aria-label="Remove track">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function Playhead({
  time, zoom, headerWidth, rulerHeight,
}: { time: number; zoom: number; headerWidth: number; rulerHeight: number }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-30"
      style={{ left: headerWidth + time * zoom, height: "100%" }}
    >
      <div className="h-full w-px bg-red-400/80" />
      <div
        className="absolute -translate-x-1/2 rounded-sm bg-red-400/90"
        style={{ top: 0, width: 9, height: rulerHeight - 6, left: 0 }}
      />
    </div>
  );
}

interface ClipBlockProps {
  clip: Clip;
  track: Track;
  zoom: number;
  selected: boolean;
  tracks: Track[];
  onSelect: (additive: boolean) => void;
  onMove: (deltaSec: number, targetTrackId: string) => void;
  onTrim: (edge: "in" | "out", deltaSec: number) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  snapToTime: (time: number) => number;
  setIsPlaying: (p: boolean) => void;
  store: typeof useEditorStore;
}

function ClipBlock({ clip, track, zoom, selected, tracks, onSelect, onMove, onTrim, scrollRef, snapToTime, setIsPlaying, store }: ClipBlockProps) {
  const left = clip.start * zoom;
  const width = Math.max(2, clip.duration * zoom);

  const media = useEditorStore((s) =>
    clip.kind === "text" ? null : s.media.find((m) => m.id === clip.mediaId) ?? null,
  );

  const label =
    clip.kind === "text"
      ? `T · ${(clip as { text: string }).text || "Text"}`
      : media?.name ?? clip.kind;

  // ── Drag to move (with optional cross-track) ──
  const dragRef = useRef<{
    startX: number;
    startTime: number;
    startTrackId: string;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.handle) return; // skip if handle
    e.stopPropagation();
    onSelect(e.shiftKey);
    setIsPlaying(false);
    dragRef.current = { startX: e.clientX, startTime: clip.start, startTrackId: clip.trackId, moved: false };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaX = e.clientX - d.startX;
    if (Math.abs(deltaX) < 3 && !d.moved) return;
    d.moved = true;
    const deltaSec = deltaX / zoom;
    // Determine target track by hover y position over the lanes.
    const wrap = scrollRef.current;
    let targetTrackId = d.startTrackId;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      const y = e.clientY - rect.top + wrap.scrollTop - RULER_HEIGHT;
      const idx = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
      const hover = tracks[idx];
      if (hover) {
        const compat =
          (hover.kind === "video" && (clip.kind === "video" || clip.kind === "image")) ||
          (hover.kind === "audio" && clip.kind === "audio") ||
          (hover.kind === "text" && clip.kind === "text");
        if (compat) targetTrackId = hover.id;
      }
    }
    const newStart = Math.max(0, d.startTime + deltaSec);
    const snapped = snapToTime(newStart);
    onMove(snapped - clip.start, targetTrackId);
  };
  const onPointerUp = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  // ── Trim handles ──
  const startTrim = (edge: "in" | "out") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsPlaying(false);
    const startX = e.clientX;
    let lastDelta = 0;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const sec = dx / zoom;
      const delta = sec - lastDelta;
      if (Math.abs(delta) < 0.01) return;
      onTrim(edge, delta);
      lastDelta = sec;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Colour per track kind.
  const bg =
    track.kind === "audio"
      ? "bg-emerald-500/30 border-emerald-300/30"
      : track.kind === "text"
      ? "bg-amber-500/30 border-amber-300/30"
      : "bg-sky-500/30 border-sky-300/30";

  void store;

  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "absolute top-1.5 cursor-grab touch-none overflow-hidden rounded-md border text-[10px] text-white shadow-sm transition select-none",
        bg,
        selected && "outline outline-2 outline-white/80",
      )}
      style={{ left, width, height: TRACK_HEIGHT - 12 }}
      title={label}
    >
      <div
        data-handle="in"
        onPointerDown={startTrim("in")}
        className="absolute left-0 top-0 z-10 h-full w-3 cursor-ew-resize touch-none bg-white/20 hover:bg-white/60 md:w-1.5"
      />
      <div
        data-handle="out"
        onPointerDown={startTrim("out")}
        className="absolute right-0 top-0 z-10 h-full w-3 cursor-ew-resize touch-none bg-white/20 hover:bg-white/60 md:w-1.5"
      />
      {/* Thumbnail strip for media clips */}
      {media?.thumbnailUrl && track.kind === "video" && (
        <div className="absolute inset-0 opacity-50">
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${media.thumbnailUrl})` }}
          />
        </div>
      )}
      <div className="absolute inset-0 flex items-center px-2.5">
        <span className="truncate font-medium">{label}</span>
      </div>
      <TransitionHandle clip={clip} />
    </div>
  );
}

function TransitionHandle({ clip }: { clip: Clip }) {
  const allClips = useEditorStore((s) => s.clips);
  const setClipTransition = useEditorStore((s) => s.setClipTransition);
  const next = useMemo(() => findAdjacentNext(clip, allClips), [clip, allClips]);
  if (!next) return null;
  const tr = clip.transitionOut;
  const maxD = maxTransitionFor(clip, next);
  const value = tr ?? { kind: "fade" as const, duration: Math.min(DEFAULT_TRANSITION_DURATION, maxD) };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-handle="transition"
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-2 top-1/2 z-20 flex h-5 w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-white/30 backdrop-blur-[24px] transition",
            tr ? "bg-white text-black" : "bg-black/70 text-white/70 hover:text-white hover:bg-black/90",
          )}
          aria-label="Transition to next clip"
          title={tr ? `Transition: ${tr.kind} (${tr.duration.toFixed(2)}s)` : "Add transition"}
        >
          <ArrowLeftRight className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-60 border-white/10 bg-black/80 p-3 text-white backdrop-blur-[24px]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Transition</span>
            {tr && (
              <button
                onClick={() => setClipTransition(clip.id, null)}
                className="text-[10px] text-white/50 hover:text-white"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {TRANSITION_OPTIONS.map((opt) => (
              <button
                key={opt.kind}
                onClick={() =>
                  setClipTransition(clip.id, {
                    kind: opt.kind,
                    duration: Math.min(value.duration, maxD),
                  })
                }
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] transition",
                  value.kind === opt.kind && tr
                    ? "border-white/40 bg-white/10 text-white"
                    : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="pt-1">
            <div className="mb-1 flex items-center justify-between text-[10px] text-white/60">
              <span>Duration</span>
              <span className="tabular-nums">{value.duration.toFixed(2)}s</span>
            </div>
            <Slider
              value={[value.duration]}
              min={MIN_TRANSITION_DURATION}
              max={Math.max(MIN_TRANSITION_DURATION + 0.05, Math.min(MAX_TRANSITION_DURATION, maxD))}
              step={0.05}
              onValueChange={(v) =>
                setClipTransition(clip.id, {
                  kind: value.kind,
                  duration: Math.max(MIN_TRANSITION_DURATION, Math.min(maxD, v[0] ?? value.duration)),
                })
              }
            />
            <p className="pt-1 text-[10px] text-white/40">Overlaps the next clip for the chosen duration.</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// expose constants for nested components
export { TRACK_HEIGHT, RULER_HEIGHT, HEADER_WIDTH };
