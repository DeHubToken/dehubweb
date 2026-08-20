/**
 * StageRecordingMiniPlayer
 * ========================
 * The corner player for a stage recording. Mounted once, app-wide, and shows
 * itself whenever anything starts a recording — the "Listen back" chip on a
 * post, the Stages modal, the Recorded tab.
 *
 * Why it exists: pressing "Listen back" used to turn a chip into the word
 * "Playing" and that was the entire interface. There was no scrub bar, no
 * sense of how much was left, and once the card scrolled away nothing could
 * stop it. The Recorded tab had the good version — a seekable waveform with a
 * countdown — but only inline, on that one page. This is that control, kept in
 * the corner so it follows the audio instead of the page.
 *
 * Bottom LEFT, and fixed. The right-hand corner already holds the radio
 * mini player and the live-stage one, both draggable and both defaulting
 * there — a third arrival would land on top of whichever was open.
 *
 * @module components/app/stages/StageRecordingMiniPlayer
 */

import { Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StaticWaveform } from '@/components/app/audio/StaticWaveform';

import {
  scrubStageRecording,
  stopStageRecording,
  useStagePlayback,
} from '@/lib/stage-playback';

export function StageRecordingMiniPlayer() {
  const { spaceId, title, progress, volume, timeLeft } = useStagePlayback();

  if (!spaceId) return null;

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={stopStageRecording}
            aria-label="Stop recording"
            title="Stop"
            className="shrink-0 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <Square className="w-3.5 h-3.5" fill="currentColor" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{title}</p>
            <div className="h-10 mt-0.5">
              <StaticWaveform
                seed={spaceId}
                className="w-full h-full"
                animated
                volumeLevel={volume}
                color="rgba(255,255,255,0.95)"
                progress={progress}
                onSeek={scrubStageRecording}
              />
            </div>
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
