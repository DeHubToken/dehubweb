/**
 * Stage recording play button
 * ===========================
 * Plays an ended stage's recording where the card sits, rather than sending
 * you somewhere to find it. The reason it exists: a /stage/:id link for an
 * ended stage redirects to /stages, and the recording may not even be in that
 * page's twenty most recent — so the "Listen back" chip on a months-old post
 * led nowhere useful. Now the chip is the player.
 *
 * The audio itself lives in lib/stage-playback, shared with the Stages modal
 * and the Recorded tab, and StageRecordingMiniPlayer draws the scrub bar and
 * countdown in the corner while it runs. This file is just the chip.
 *
 * Renders as a <span role="button">, not a <button>: every surface that shows
 * this — the link embed above all — wraps the whole card in a <button>, and
 * nesting one inside another is invalid DOM.
 */

import { useCallback } from 'react';
import type { SyntheticEvent } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  stopStageRecording,
  toggleStageRecording,
  useStagePlayback,
} from '@/lib/stage-playback';

// Re-exported because callers already import it from here — PastStagesList
// silences feed playback before taking over, and AppLayout stops it on logout.
export { stopStageRecording };

export function StageRecordingButton({
  spaceId,
  recordingUrl,
  title,
  startedAt,
  endedAt,
  className,
  label = 'Listen back',
}: {
  spaceId: string;
  /** No recording, no button — see the null return below. */
  recordingUrl?: string | null;
  /** Shown in the corner player. Falls back to a generic name. */
  title?: string | null;
  /**
   * The stage's span. webm recordings routinely lie about their own duration,
   * and these two are what the scrub bar falls back to — without them the
   * corner player can still play, but it cannot show progress.
   */
  startedAt?: string | null;
  endedAt?: string | null;
  className?: string;
  /** Chip text while stopped. Pass null for an icon-only control. */
  label?: string | null;
}) {
  const { spaceId: playingId, loading } = useStagePlayback();
  const isPlaying = playingId === spaceId;

  const toggle = useCallback(
    (e: SyntheticEvent) => {
      // These sit inside cards that navigate on click.
      e.preventDefault();
      e.stopPropagation();
      if (!recordingUrl) return;
      toggleStageRecording({
        id: spaceId,
        title,
        recording_url: recordingUrl,
        started_at: startedAt,
        ended_at: endedAt,
      });
    },
    [spaceId, recordingUrl, title, startedAt, endedAt],
  );

  // A stage can end without a recording — the host may have blocked the mic
  // prompt, or the upload may have failed. A play button that cannot play is
  // worse than no button, so there isn't one.
  if (!recordingUrl) return null;

  const busy = isPlaying && loading;

  return (
    <span
      role="button"
      tabIndex={0}
      data-no-navigate
      aria-label={isPlaying ? 'Stop recording' : 'Play recording'}
      title={isPlaying ? 'Stop' : 'Play the recording'}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') toggle(e);
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg text-xs font-medium shrink-0 cursor-pointer',
        'transition-colors select-none',
        label === null ? 'w-8 h-8 justify-center' : 'px-2.5 py-1',
        isPlaying
          ? 'bg-white text-black hover:bg-white/90'
          : 'bg-white/10 text-white hover:bg-white/20',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPlaying ? (
        <Square className="w-3 h-3" fill="currentColor" />
      ) : (
        <Play className="w-3 h-3" fill="currentColor" />
      )}
      {label !== null && (isPlaying ? 'Playing' : label)}
    </span>
  );
}

export default StageRecordingButton;
