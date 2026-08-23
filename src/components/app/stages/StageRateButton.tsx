/**
 * StageRateButton — the playback-speed chip for stage recordings
 * =============================================================
 * One control for every surface a recording plays from: the card in the feed,
 * the Recorded tab rows, the Stages modal, the stage's own page and the corner
 * player. It cycles the shared engine's rate through the same ladder the video
 * players use and the engine persists it, so a speed picked here is still on
 * after the tab is closed and reopened.
 *
 * A <span role="button"> rather than a <button> for the same reason
 * StageRecordingPlayer's controls are: some of those cards sit inside a
 * navigating <button>, and nested buttons get repaired by the browser into
 * broken DOM.
 *
 * @module components/app/stages/StageRateButton
 */

import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { cycleStageRecordingRate, useStagePlayback } from '@/lib/stage-playback';

/** Compact label — "1x", "1.5x", "1.25x" — sized for a chip, not "1.00x". */
export function formatStageRate(rate: number): string {
  return `${rate}`;
}

export function StageRateButton({
  className,
}: {
  className?: string;
}) {
  const { rate } = useStagePlayback();
  const label = `${formatStageRate(rate)}x`;

  const cycle = (e: KeyboardEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cycleStageRecordingRate();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Playback speed ${label}`}
      title={`Playback speed ${label}`}
      onClick={cycle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') cycle(e);
      }}
      className={cn(
        'shrink-0 h-7 min-w-9 px-2 rounded-lg flex items-center justify-center cursor-pointer select-none',
        'text-[10px] font-mono font-bold leading-none transition-colors',
        rate !== 1
          ? 'bg-white/20 text-white'
          : 'text-white/50 hover:text-white hover:bg-white/10',
        className,
      )}
    >
      {label}
    </span>
  );
}

export default StageRateButton;
