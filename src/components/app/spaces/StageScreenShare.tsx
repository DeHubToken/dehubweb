/**
 * StageScreenShare - the screen a stage host is sharing, on everyone's wall
 * ========================================================================
 * Stages are an audio room, so the shared screen is the one visual element in
 * it: a plain 16:9 slab that appears when a share starts and disappears when it
 * stops. Rendered in the live modal for people in the room and on the invite
 * page for guests listening in signed-out — both read the same
 * `screenShare` off StageContext, which is fed by the host's local track or by
 * Agora's `user-published` for everyone else.
 *
 * Agora owns the `<video>` element: `track.play(container)` creates one inside
 * the div and manages its sizing. Remote tracks default to `cover`, which
 * crops a shared desktop to fill the box — `fit: 'contain'` is not decoration,
 * it is the difference between seeing the screen and seeing the middle of it.
 */

import { useEffect, useRef, useState } from 'react';
import { Expand, Shrink, MonitorUp } from 'lucide-react';
import { useStage } from '@/contexts/StageContext';
import { cn } from '@/lib/utils';

interface StageScreenShareProps {
  className?: string;
  /** Who is sharing, for the corner label. Falls back to a generic line. */
  sharerName?: string | null;
}

export function StageScreenShare({ className, sharerName }: StageScreenShareProps) {
  const { screenShare } = useStage();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const track = screenShare?.track ?? null;
  const isLocal = !!screenShare?.isLocal;

  useEffect(() => {
    const box = videoBoxRef.current;
    if (!track || !box) return;
    try {
      // No mirroring: a mirrored screen share is unreadable text.
      track.play(box, { fit: 'contain', mirror: false });
    } catch (err) {
      console.warn('[Stage] Could not play shared screen', err);
    }
    return () => {
      // stop() ends playback only. Closing the capture is the sharer's job
      // (stopScreenShare / leaveSpace) — doing it here would kill the share
      // every time the modal minimised.
      try { track.stop(); } catch { /* noop */ }
    };
  }, [track]);

  // The Escape key and the browser's own chrome can leave fullscreen without
  // going through the button, so the icon follows the document, not the click.
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (!screenShare) return null;

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* noop */ });
    } else {
      void el.requestFullscreen?.().catch(() => { /* noop */ });
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-black',
        // Fullscreen drops the box so the screen fills the display. Tailwind 3
        // has no `fullscreen:` variant, hence driving it off the state flag.
        isFullscreen ? 'h-full' : 'aspect-video rounded-xl border border-white/10',
        className,
      )}
    >
      <div ref={videoBoxRef} className="absolute inset-0" />

      <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm pointer-events-none">
        <MonitorUp className="w-3.5 h-3.5 text-white/70" />
        <span className="text-[11px] font-medium text-white/90">
          {isLocal
            ? "You're sharing your screen"
            : sharerName
              ? `@${sharerName} is sharing`
              : 'Screen share'}
        </span>
      </div>

      <button
        type="button"
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/80 flex items-center justify-center transition-colors"
      >
        {isFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
      </button>
    </div>
  );
}
