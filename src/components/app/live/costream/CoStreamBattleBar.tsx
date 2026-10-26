/**
 * The battle bar: two creators, a clock, and who is ahead on gifts.
 *
 * Drawn over the player rather than burned into the video, so it moves the
 * moment a gift is counted instead of a few seconds later with the stream.
 * The stream being watched always sits on the left. When the bell goes, the
 * bar becomes the result for a few seconds, then gets out of the way.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { battlePhase, battleSides, type CoStreamState } from '@/lib/live/costream-api';
import { participantLabel } from '@/hooks/use-costream-host';

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtScore = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${Math.round(n)}`);

export function CoStreamBattleBar({ state, streamId, className }: { state: CoStreamState | null; streamId?: string; className?: string }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const phase = battlePhase(state?.room, now);

  useEffect(() => {
    if (!state?.room.battle_ends_at) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [state?.room.battle_ends_at]);

  const sides = battleSides(state);
  if (phase === 'idle' || !sides || !state) return null;

  const swap = streamId != null && streamId === sides.guest.streamId;
  const left = swap ? sides.guest : sides.host;
  const right = swap ? sides.host : sides.guest;
  const total = left.score + right.score;
  const share = total > 0 ? left.score / total : 0.5;
  const remaining = Date.parse(state.room.battle_ends_at!) - now;
  const winner = left.score === right.score ? null : left.score > right.score ? left : right;

  return (
    <div className={cn('pointer-events-none w-[min(92vw,26rem)] select-none text-white', className)}>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.9))]">
        <span className="min-w-0 truncate">{participantLabel(left.username, left.wallet)}</span>
        <span className="mx-2 shrink-0 rounded-md bg-black/50 px-1.5 py-0.5 font-mono tabular-nums">
          {phase === 'running' ? fmtClock(remaining) : t('costream.battleOver', { defaultValue: 'Final' })}
        </span>
        <span className="min-w-0 truncate text-right">{participantLabel(right.username, right.wallet)}</span>
      </div>
      <div className="relative flex h-6 overflow-hidden rounded-full border border-white/20 bg-black/40 text-[11px] font-bold tabular-nums">
        <div
          className="flex items-center bg-gradient-to-r from-rose-600 to-rose-400 pl-2 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(92, Math.max(8, share * 100))}%` }}
        >
          {fmtScore(left.score)}
        </div>
        <div className="flex flex-1 items-center justify-end bg-gradient-to-l from-sky-600 to-sky-400 pr-2">
          {fmtScore(right.score)}
        </div>
      </div>
      {phase === 'result' && (
        <div className="mt-2 flex animate-in fade-in zoom-in-50 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/60 px-4 py-2.5 text-sm font-semibold backdrop-blur-xl duration-500">
          <Trophy className="h-5 w-5 animate-bounce text-amber-300" />
          {winner
            ? t('costream.battleWinner', { defaultValue: '{{name}} wins!', name: participantLabel(winner.username, winner.wallet) })
            : t('costream.battleDraw', { defaultValue: "It's a draw" })}
        </div>
      )}
    </div>
  );
}

export default CoStreamBattleBar;
