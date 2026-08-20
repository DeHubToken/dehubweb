/**
 * StageRecordingMiniPlayer
 * ========================
 * The corner player for a stage recording. Mounted once, app-wide, and shown
 * when somebody asks for it — the pop-out control that sits beside play on a
 * post's stage card, in the Recorded tab, in the Stages modal and on a stage's
 * own page.
 *
 * It used to show itself the moment anything started playing, which put a
 * floating panel over the corner of the page every time somebody pressed play
 * in the feed, whether or not they were going anywhere. Playing in place is
 * the common case; the corner player is for carrying the audio with you, so it
 * waits to be asked.
 *
 * **Pause and close are two different buttons.** The only control this had was
 * a square that called stopStageRecording, so the thing that looked like pause
 * dropped the recording, the position and the panel with it — press it to
 * pause and the player vanished. Now the round control holds the audio where
 * it is, and the X ends playback and dismisses the panel.
 *
 * Bottom LEFT, and fixed. The right-hand corner already holds the radio mini
 * player and the live-stage one, both draggable and both defaulting there — a
 * third arrival would land on top of whichever was open.
 *
 * @module components/app/stages/StageRecordingMiniPlayer
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Pause, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';

import {
  scrubStageRecording,
  stopStageRecording,
  togglePauseStageRecording,
  useStagePlayback,
} from '@/lib/stage-playback';

export function StageRecordingMiniPlayer() {
  const { spaceId, title, loading, paused, popout, progress, volume, timeLeft } =
    useStagePlayback();
  const { pathname } = useLocation();

  // Leaving the page stops a recording that was not popped out. The inline
  // control driving it goes with the page and this panel is hidden, so
  // anything still playing would be audible and unreachable — which is the
  // hole that opened the moment the corner player stopped appearing by
  // itself. Popping out is how you say you want to carry the audio with you.
  useEffect(() => {
    if (spaceId && !popout) stopStageRecording();
    // Keyed on the path alone on purpose: this fires on navigation, not when
    // playback starts on the page you are already standing on. Query strings
    // are excluded for the same reason — ?chat=1 is not leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!spaceId || !popout) return null;

  return (
    <div
      className={cn(
        'fixed left-4 bottom-20 md:bottom-4 z-50 select-none',
        'w-[calc(100vw-2rem)] max-w-sm',
      )}
      role="region"
      aria-label="Stage recording playback"
    >
      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl shadow-2xl p-3">
        {/* Title and close share a line: the X wants the corner it is always
            looked for in, and the title has nowhere else to go. */}
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-xs font-medium text-white truncate leading-6">
            {title}
          </p>
          <button
            type="button"
            onClick={stopStageRecording}
            aria-label="Stop and close the player"
            title="Stop and close"
            className="shrink-0 -mr-1 -mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={togglePauseStageRecording}
            aria-label={paused ? 'Resume recording' : 'Pause recording'}
            title={paused ? 'Resume' : 'Pause'}
            className="shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : paused ? (
              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
            ) : (
              <Pause className="w-3.5 h-3.5" fill="currentColor" />
            )}
          </button>

          <div
            className={cn(
              'flex-1 min-w-0 h-10 transition-opacity duration-300',
              paused ? 'opacity-60' : 'opacity-100',
            )}
          >
            <StaticWaveform
              seed={spaceId}
              className="w-full h-full"
              animated={!paused}
              volumeLevel={volume}
              color="rgba(255,255,255,0.95)"
              progress={progress}
              onSeek={scrubStageRecording}
            />
          </div>

          {timeLeft && (
            <span className="text-[10px] text-white/50 font-mono shrink-0">{timeLeft}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default StageRecordingMiniPlayer;
