/**
 * Stage recording player — the control on a stage card
 * ====================================================
 * Plays an ended stage's recording where the card sits, rather than sending
 * you somewhere to find it — what you want from a post about a stage that
 * already happened is usually to hear it without leaving the feed.
 *
 * This used to be a chip: a play icon, the words "Listen back", and on press
 * the words changed to "Playing". That was the entire interface. There was no
 * scrub bar, no sense of how long was left and no way back to a moment you had
 * gone past, while the stage's own page had all three. So the card carries the
 * same seekable waveform the Recorded tab and the deep-link page do — press
 * anywhere on the bars to jump there, and the recording starts from that point
 * if it was not already playing.
 *
 * The audio itself lives in lib/stage-playback, shared with every other
 * surface, so playing here stops whatever else was running.
 *
 * ── Why spans and not buttons ──
 * Every surface that shows this wraps the whole card in a <button> that
 * navigates to the stage, and a <button> inside a <button> is invalid DOM that
 * browsers repair by unnesting — so the controls are <span role="button">, and
 * the row stops clicks and pointer-downs from reaching the card underneath.
 * The waveform is an <svg>, which nests legally.
 *
 * @module components/app/stages/StageRecordingPlayer
 */

import { useCallback, useMemo } from 'react';
import type { KeyboardEvent, SyntheticEvent } from 'react';
import { Play, Pause, Loader2, PictureInPicture2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';
import {
  closeStagePopout,
  popOutStageRecording,
  seekStageRecording,
  toggleStageRecording,
  useStagePlayback,
  type StagePlayable,
} from '@/lib/stage-playback';

export function StageRecordingPlayer({
  spaceId,
  recordingUrl,
  title,
  startedAt,
  endedAt,
  className,
}: {
  spaceId: string;
  /** No recording, no player — see the null return below. */
  recordingUrl?: string | null;
  /** Shown in the corner player. Falls back to a generic name. */
  title?: string | null;
  /**
   * The stage's span. webm recordings routinely lie about their own duration,
   * and these two are what the scrub bar falls back to — without them it can
   * still play, but it cannot show progress.
   */
  startedAt?: string | null;
  endedAt?: string | null;
  className?: string;
}) {
  const {
    spaceId: loadedId,
    loading,
    paused,
    popout,
    progress,
    volume,
    timeLeft,
  } = useStagePlayback();

  const isLoaded = loadedId === spaceId;
  const isPlaying = isLoaded && !paused;
  const busy = isLoaded && loading;

  const space: StagePlayable = useMemo(
    () => ({
      id: spaceId,
      title,
      recording_url: recordingUrl,
      started_at: startedAt,
      ended_at: endedAt,
    }),
    [spaceId, title, recordingUrl, startedAt, endedAt],
  );

  const togglePlay = useCallback(
    (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleStageRecording(space);
    },
    [space],
  );

  // Pop out an idle recording and it starts playing, which is the only reading
  // of the control that makes sense from a card nobody has pressed play on.
  const togglePopout = useCallback(
    (e: SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isLoaded && popout) closeStagePopout();
      else popOutStageRecording(space);
    },
    [isLoaded, popout, space],
  );

  const seek = useCallback((position: number) => seekStageRecording(space, position), [space]);

  // A stage can end without a recording — the host may have blocked the mic
  // prompt, or the upload may have failed. A player that cannot play is worse
  // than no player, so there isn't one.
  if (!recordingUrl) return null;

  const controlKeys = (handler: (e: SyntheticEvent) => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') handler(e);
  };

  return (
    <div
      data-no-navigate
      role="group"
      aria-label="Stage recording"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.05] p-2',
        className,
      )}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        title={isPlaying ? 'Pause' : 'Play the recording'}
        onClick={togglePlay}
        onKeyDown={controlKeys(togglePlay)}
        className={cn(
          'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer select-none',
          'transition-colors',
          isLoaded
            ? 'bg-white/15 text-white hover:bg-white/25'
            : 'bg-white text-black hover:bg-white/90',
        )}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        )}
      </span>

      {/* Seek starts playback or scrubs. Dim until this is the loaded
          recording, so a feed of stage cards reads as one live bar and a row
          of pictures rather than several things all claiming to be playing. */}
      <div
        className={cn(
          'flex items-center gap-2 flex-1 min-w-0 h-9 transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-40',
        )}
      >
        <StaticWaveform
          seed={spaceId}
          className="w-full min-w-0 h-full flex-1"
          animated={isPlaying}
          volumeLevel={isPlaying ? volume : 0}
          color={isLoaded ? 'rgba(255,255,255,0.95)' : undefined}
          progress={isLoaded ? progress : undefined}
          onSeek={seek}
        />
        {isLoaded && timeLeft && (
          <span className="text-[10px] text-white/50 font-mono shrink-0 w-10 text-right">
            {timeLeft}
          </span>
        )}
      </div>

      <span
        role="button"
        tabIndex={0}
        aria-label={isLoaded && popout ? 'Close the corner player' : 'Pop out the player'}
        aria-pressed={isLoaded && popout}
        title={isLoaded && popout ? 'Close the corner player' : 'Pop out — keep listening while you browse'}
        onClick={togglePopout}
        onKeyDown={controlKeys(togglePopout)}
        className={cn(
          'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer select-none',
          'transition-colors',
          isLoaded && popout
            ? 'bg-white/15 text-white'
            : 'text-white/50 hover:text-white hover:bg-white/10',
        )}
      >
        <PictureInPicture2 className="w-4 h-4" />
      </span>
    </div>
  );
}

export default StageRecordingPlayer;
