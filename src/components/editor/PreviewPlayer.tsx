import { useEffect, useMemo, useRef } from "react";
import { Play, Pause, Image as ImageIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";

function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PreviewPlayer() {
  const media = useEditorStore((s) => s.media);
  const selectedId = useEditorStore((s) => s.selectedId);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setDuration = useEditorStore((s) => s.setDuration);

  const selected = useMemo(
    () => media.find((m) => m.id === selectedId) ?? null,
    [media, selectedId],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const elRef = selected?.kind === "audio" ? audioRef : videoRef;

  // Sync play/pause state to element.
  useEffect(() => {
    const el = elRef.current;
    if (!el || !selected || selected.kind === "image") return;
    if (isPlaying) {
      void el.play().catch(() => setIsPlaying(false));
    } else {
      el.pause();
    }
  }, [isPlaying, selected, elRef, setIsPlaying]);

  // Reset state when selection changes.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(selected?.duration ?? 0);
  }, [selected?.id, selected?.duration, setCurrentTime, setDuration]);

  const onSeek = (val: number[]) => {
    const t = val[0] ?? 0;
    setCurrentTime(t);
    const el = elRef.current;
    if (el && selected && selected.kind !== "image") el.currentTime = t;
  };

  const togglePlay = () => {
    if (!selected || selected.kind === "image") return;
    setIsPlaying(!isPlaying);
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-black">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.04),_transparent_70%)] p-4">
        {!selected && (
          <div className="text-center text-sm text-white/40">
            Select media from the library to preview it here.
          </div>
        )}

        {selected?.kind === "video" && (
          <video
            ref={videoRef}
            key={selected.id}
            src={selected.url}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            playsInline
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
          />
        )}

        {selected?.kind === "audio" && (
          <>
            <audio
              ref={audioRef}
              key={selected.id}
              src={selected.url}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="flex flex-col items-center gap-2 text-white/70">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/5">
                <Play className="h-8 w-8" />
              </div>
              <p className="text-sm">{selected.name}</p>
            </div>
          </>
        )}

        {selected?.kind === "image" && (
          <img
            src={selected.url}
            alt={selected.name}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-[24px]">
        <Button
          size="icon"
          variant="ghost"
          onClick={togglePlay}
          disabled={!selected || selected.kind === "image"}
          className="h-8 w-8 rounded-md text-white hover:bg-white/10"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {selected?.kind === "image" ? (
            <ImageIcon className="h-4 w-4" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <span className="w-24 text-xs tabular-nums text-white/70">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <Slider
          value={[Math.min(currentTime, duration || 0)]}
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          onValueChange={onSeek}
          className="flex-1"
          disabled={!selected || selected.kind === "image" || !duration}
        />
      </div>
    </section>
  );
}
