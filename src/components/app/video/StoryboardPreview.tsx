import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/feed-utils';
import { storyboardOffset, type Storyboard } from '@/lib/storyboard';

interface StoryboardPreviewProps {
  storyboard?: Storyboard;
  /** Where the finger or pointer is along the timeline, 0–1. */
  fraction: number;
  duration: number;
  /** Shown only while scrubbing. */
  visible: boolean;
  /** Start fetching the sheet before the first scrub (controls are up). */
  armed?: boolean;
}

/**
 * The frame under the finger while scrubbing, floated above the timeline.
 *
 * Mount it inside the element that spans the timeline's width; it positions
 * itself above that element's top edge and never takes pointer events, so the
 * scrub gesture underneath is untouched. Renders nothing for a post without a
 * public storyboard, or if the sheet fails to load.
 */
export function StoryboardPreview({ storyboard, fraction, duration, visible, armed = false }: StoryboardPreviewProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = storyboard?.url;

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [url]);

  useEffect(() => {
    if (!url || (!armed && !visible)) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { if (!cancelled) setLoaded(true); };
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url, armed, visible]);

  if (!storyboard || !visible || failed || !loaded || !(duration > 0)) return null;

  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const seconds = clamped * duration;
  const { x, y } = storyboardOffset(storyboard, seconds);
  const half = storyboard.spriteWidth / 2 + 4;

  return (
    <div
      data-storyboard-preview
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full z-30 mb-3 flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ left: `clamp(${half}px, ${clamped * 100}%, calc(100% - ${half}px))` }}
    >
      <div
        className="overflow-hidden rounded-md border border-white/30 bg-black shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
        style={{
          width: storyboard.spriteWidth,
          height: storyboard.spriteHeight,
          backgroundImage: `url("${storyboard.url}")`,
          backgroundPosition: `-${x}px -${y}px`,
          backgroundRepeat: 'no-repeat',
        }}
      />
      <span className="rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
        {formatDuration(Math.floor(seconds))}
      </span>
    </div>
  );
}
