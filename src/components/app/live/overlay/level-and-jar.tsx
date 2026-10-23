/**
 * Two creator widgets: the streamer's level and weekly streak (from the same
 * progress the profile card shows), and a tip jar that fills with paid gifts.
 */
import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getStreamerProgress } from '@/lib/api/dehub/livestream';
import { setting } from '@/lib/live-overlay/registry';
import type { OverlayStats } from '@/lib/live-overlay/types';
import { OverlayCreatorContext } from './subathon';
import { useOverlayEvent } from './overlay-events';

const HEX = /^#[0-9a-f]{6}$/i;
const tintOf = (settings: Record<string, unknown>) => {
  const c = setting(settings, 'accent', '#ffffff');
  return HEX.test(c) ? c : '#ffffff';
};

export function StreamerLevel({ settings }: { settings: Record<string, unknown> }) {
  const { t } = useTranslation();
  const creator = useContext(OverlayCreatorContext);
  const showStreak = setting(settings, 'showStreak', true);
  const { data } = useQuery({
    queryKey: ['streamer-progress', creator],
    queryFn: () => getStreamerProgress(creator),
    enabled: !!creator,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  if (!data) return null;
  const progress = Math.min(1, Math.max(0, Number(data.progressToNext) || 0));
  return (
    <div data-ow-goal style={{ '--ow-accent': tintOf(settings) } as CSSProperties}>
      <div data-ow-goal-head>
        <span>{t('liveOverlay.level', { level: data.level })}</span>
        {showStreak && data.currentStreakWeeks > 0 && <span>{t('liveOverlay.streak', { count: data.currentStreakWeeks })}</span>}
      </div>
      <div data-ow-goal-track>
        <div data-ow-goal-fill style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}

/** How long a dropped coin is shown falling in. */
const DROP_MS = 1200;

export function TipJar({ settings, stats }: { settings: Record<string, unknown>; stats: OverlayStats }) {
  const { t } = useTranslation();
  const target = Math.max(1, setting(settings, 'target', 100_000));
  const title = setting(settings, 'title', '') || t('liveOverlay.tipJar');
  const base = stats.totalTips;
  // Counted on top of the server's figure until the server's figure moves.
  const [delta, setDelta] = useState(0);
  const [drops, setDrops] = useState<number[]>([]);
  useEffect(() => setDelta(0), [base]);
  useOverlayEvent((event) => {
    if (event.type !== 'tipConfirmed') return;
    setDelta((d) => d + event.paidAmount);
    const id = Date.now() + Math.random();
    setDrops((list) => [...list.slice(-4), id]);
    window.setTimeout(() => setDrops((list) => list.filter((x) => x !== id)), DROP_MS);
  });
  const value = base + delta;
  const fill = Math.min(1, value / target);
  return (
    <div data-ow-jar style={{ '--ow-accent': tintOf(settings) } as CSSProperties}>
      <div data-ow-jar-glass>
        <div data-ow-jar-fill style={{ transform: `scaleY(${fill})` }} />
        {drops.map((id, i) => (
          <span key={id} data-ow-jar-coin style={{ left: `${20 + ((i * 23) % 60)}%` }} aria-hidden>
            🪙
          </span>
        ))}
      </div>
      <div data-ow-jar-caption>
        <span>{title}</span>
        <span>{`${Math.floor(value).toLocaleString()} / ${target.toLocaleString()} DHB`}</span>
      </div>
    </div>
  );
}
