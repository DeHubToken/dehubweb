/**
 * Hype trains, drawn from state the stream API keeps.
 *
 * Gifts and subscriptions are counted on the server, so every screen shows the
 * same level and the same countdown: the player's bar, the OBS widget and Live
 * Studio's preview. A train that ended stays on screen a few seconds to show
 * the level the room reached, then goes.
 */
import { createContext, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { getHypeTrain, type HypeTrain } from '@/lib/api/dehub/live-hype';
import { setting } from '@/lib/live-overlay/registry';
import { cn } from '@/lib/utils';

const ENDED_HOLD_MS = 8000;
const HEX = /^#[0-9a-f]{6}$/i;

export const HypeContext = createContext<HypeTrain | null>(null);

/** The stream's hype train, from a fetch on open and its room after that. Null when there is none. */
export function useStreamHype(streamId: string | null | undefined): HypeTrain | null {
  const [train, setTrain] = useState<HypeTrain | null>(null);
  useEffect(() => {
    setTrain(null);
    if (!streamId) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    getHypeTrain(streamId)
      .then((t) => !cancelled && t && setTrain((prev) => prev ?? t))
      .catch(() => undefined);
    import('@/lib/api/dehub/overlay-control')
      .then(({ watchStreamHype }) => {
        if (!cancelled) sub = watchStreamHype(streamId, setTrain);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [streamId]);

  // Off screen once it ended and has been shown, or ran out without an end event reaching us.
  useEffect(() => {
    if (!train) return;
    const until = train.ended ? Date.now() + ENDED_HOLD_MS : new Date(train.expiresAt).getTime() + ENDED_HOLD_MS;
    const id = window.setTimeout(() => setTrain((t) => (t === train ? null : t)), Math.max(0, until - Date.now()));
    return () => window.clearTimeout(id);
  }, [train]);

  return train;
}

/** Seconds left on the train, ticking. */
function useSecondsLeft(train: HypeTrain | null): number {
  const [now, setNow] = useState(() => Date.now());
  const live = !!train && !train.ended;
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  if (!train || train.ended) return 0;
  return Math.max(0, Math.ceil((new Date(train.expiresAt).getTime() - now) / 1000));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function useHypeLines(train: HypeTrain) {
  const { t } = useTranslation();
  const left = useSecondsLeft(train);
  const title = train.ended
    ? train.completed > 0
      ? t('liveHype.train.endedLevel', { level: train.completed })
      : t('liveHype.train.ended')
    : t('liveHype.train.level', { level: train.level });
  const detail = train.ended ? t('liveHype.train.thanks', { count: train.contributors }) : mmss(left);
  const progress = train.ended ? 1 : Math.min(1, train.into / Math.max(1, train.need));
  return { title, detail, progress };
}

/** The OBS and in-app overlay widget: the goal bar's look, filled by the room. */
export function HypeTrainWidget({ settings }: { settings: Record<string, unknown> }) {
  const train = useContext(HypeContext);
  if (!train) return null;
  return <HypeWidgetBody train={train} settings={settings} />;
}

function HypeWidgetBody({ train, settings }: { train: HypeTrain; settings: Record<string, unknown> }) {
  const { title, detail, progress } = useHypeLines(train);
  const tint = setting(settings, 'accent', '#f97316');
  return (
    <div data-ow-goal data-reached={train.ended || undefined} style={{ '--ow-accent': HEX.test(tint) ? tint : '#f97316' } as CSSProperties}>
      <div data-ow-goal-head>
        <span>🚂 {title}</span>
        <span>{detail}</span>
      </div>
      <div data-ow-goal-track>
        <div data-ow-goal-fill style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}

/**
 * The bar across the top of the player while a train runs. Drawn whatever
 * overlay the creator has, or none: a train is the room's, not a widget.
 */
export function HypeTrainBar({ streamId, className }: { streamId: string | null | undefined; className?: string }) {
  const train = useStreamHype(streamId);
  if (!train) return null;
  return <HypeBarBody train={train} className={className} />;
}

function HypeBarBody({ train, className }: { train: HypeTrain; className?: string }) {
  const { t } = useTranslation();
  const { title, detail, progress } = useHypeLines(train);
  const top = train.top[0];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none rounded-xl border border-orange-400/40 bg-black/70 px-3 py-2 text-white shadow-lg backdrop-blur-sm',
        train.levelUp && 'animate-pulse',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span className="truncate">🚂 {title}</span>
        <span className="shrink-0 tabular-nums text-orange-200">{detail}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full origin-left rounded-full bg-gradient-to-r from-orange-500 to-yellow-300 transition-transform duration-700"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      {top && !train.ended && (
        <p className="mt-1 truncate text-[11px] text-zinc-300">
          {t('liveHype.train.top', { name: top.displayName || top.username || `${(top.address || '').slice(0, 6)}…` })}
        </p>
      )}
    </div>
  );
}
