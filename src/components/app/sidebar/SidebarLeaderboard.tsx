import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { AppState } from '@/components/app/AppState';
import {
  applyLeaderboardRules,
  formatLeaderboardNumber,
  getEntryValue,
  hasDelta,
  isHidden,
} from '@/lib/leaderboard-rules';

import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import medal3 from '@/assets/medal-3.png';
import medal4 from '@/assets/medal-4.png';
import medal5 from '@/assets/medal-5.png';
import medal6 from '@/assets/medal-6.png';
import medal7 from '@/assets/medal-7.png';
import medal8 from '@/assets/medal-8.png';
import medal9 from '@/assets/medal-9.png';
import medal10 from '@/assets/medal-10.png';

const PERIODS = ['1D', '1W', '1M', '1Y', 'All'] as const;
type PeriodLabel = typeof PERIODS[number];
const PERIOD_MAP: Record<PeriodLabel, LeaderboardPeriod> = {
  '1D': 'day',
  '1W': 'week',
  '1M': 'month',
  '1Y': 'year',
  'All': 'all',
};

const MEDALS = [medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10];

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50';

/** The query key every leaderboard surface shares for a holdings period. */
const holdingsKey = (period: LeaderboardPeriod) => ['leaderboard', 'holdings', period] as const;

export interface SidebarLeaderboardHandle {
  /** Try to swipe the period. Returns true if consumed, false if at edge. */
  swipePeriod: (direction: 1 | -1) => boolean;
}

/** Renders a single period's leaderboard list — always mounted, visibility toggled by parent */
const PeriodList = memo(function PeriodList({ period, isActive }: { period: PeriodLabel; isActive: boolean }) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const apiPeriod = PERIOD_MAP[period] || 'all';
  const isTimeDelta = apiPeriod !== 'all';

  const { data, isError } = useQuery({
    queryKey: holdingsKey(apiPeriod),
    queryFn: () => getLeaderboard('holdings', apiPeriod),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
    // Only the visible period fetches — all periods used to fire at boot and
    // compete with the feed request on one connection (LCP audit 7/14). Switching
    // periods fetches on demand; the 1h staleTime keeps revisits instant.
    enabled: isActive,
  });

  const entries = applyLeaderboardRules(data?.result?.byWalletBalance, { sort: 'holdings', period: apiPeriod }).slice(0, 50);

  // A period that has not been fetched yet (it is off-screen, or waiting for
  // the user) is loading, not empty — the empty state is only for a row the
  // server actually answered with nothing.
  if (!data) {
    if (isError) {
      return <AppState icon="trophy" title={t('leaderboard.failedToLoad')} size="compact" />;
    }
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label={t('leaderboard.loadingBoard')}>
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <AppState icon="trophy" title={isTimeDelta ? t('leaderboard.noDataForPeriod') : t('leaderboard.noDataYet')} size="compact" />
    );
  }

  const getAvatarUrl = (entry: LeaderboardEntry) => {
    if (entry.avatarUrl && entry.account) {
      return buildAvatarUrl(entry.account, entry.avatarUrl);
    }
    return null;
  };

  const getDisplayName = (entry: LeaderboardEntry) => {
    return entry.userDisplayName || entry.username || `${entry.account.slice(0, 6)}...${entry.account.slice(-4)}`;
  };

  const getHandle = (entry: LeaderboardEntry) => {
    if (entry.username) return `@${entry.username}`;
    return `${entry.account.slice(0, 6)}...${entry.account.slice(-4)}`;
  };

  const formatValue = (entry: LeaderboardEntry): string => {
    if (isHidden(entry)) return t('leaderboard.hidden');
    if (isTimeDelta && !hasDelta(entry, 'holdings', apiPeriod)) return '—';
    const value = getEntryValue(entry, 'holdings', apiPeriod);
    const prefix = isTimeDelta && value > 0 ? '+' : '';
    return `${prefix}${formatLeaderboardNumber(value)}`;
  };

  return (
    <div className="space-y-1 pr-1">
      {entries.map((entry) => {
        const rank = entry.rank;
        const hidden = isHidden(entry);
        const displayName = getDisplayName(entry);
        return (
          <Link
            key={entry.account}
            to={`/${entry.username}`}
            aria-label={`${t('leaderboard.rankN', { rank })} · ${displayName}`}
            // The strip's off-screen panels must not be tab stops.
            tabIndex={isActive ? 0 : -1}
            className={cn(
              "flex items-center gap-3 py-2 px-4 transition-colors cursor-pointer",
              isLightTheme ? 'hover:bg-zinc-100' : 'hover:bg-zinc-800/50',
              FOCUS_RING,
            )}
          >
            {/* Rank */}
            <div className="w-7 flex-shrink-0 flex items-center justify-center">
              {rank <= 10 ? (
                <div
                  className={`medal-shine-container ${rank <= 3 ? 'w-10 h-10' : 'w-6 h-6'}`}
                  style={{ '--medal-mask': `url(${MEDALS[rank - 1]})` } as React.CSSProperties}
                >
                  <img
                    src={MEDALS[rank - 1]}
                    alt={t('leaderboard.rankN', { rank })}
                    className={`${rank <= 3 ? 'w-10 h-10' : 'w-6 h-6'} object-contain relative`}
                  />
                  <div
                    className="medal-shine-overlay"
                  />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-lg bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
                  {rank}
                </div>
              )}
            </div>

            {/* Avatar */}
            <LeaderboardUserAvatar
              avatarUrl={getAvatarUrl(entry)}
              fallbackSeed={entry.account}
              displayName={displayName}
              size="sm"
            />

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-0 min-w-0">
                <span className="relative inline-flex items-baseline gap-1 shrink min-w-0">
                  <span className="font-semibold text-white text-sm truncate min-w-0">
                    {displayName}
                  </span>
                  {!hidden && (
                    <BadgeIcon badgeBalance={entry.badgeBalance || entry.total} username={entry.username} className="w-[1em] h-[1em]" />
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500 truncate">{getHandle(entry)}</span>
                <span className="flex-1" />
                <span className="text-zinc-400 shrink-0 tabular-nums">{formatValue(entry)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
});

export const SidebarLeaderboard = forwardRef<SidebarLeaderboardHandle>(function SidebarLeaderboard(_props, ref) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [activePeriod, setActivePeriod] = useState<PeriodLabel>('All');
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // Rotate only while actually on screen (the panel can sit in a hidden tab
  // of the side rail, and instances live inside CSS-hidden cached pages).
  const [isOnScreen, setIsOnScreen] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setIsOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Any interaction (a click, a swipe, hovering the widget) holds the strip
  // still for 30s from the last one — one timer, restarted, not one per event.
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseRotation = useCallback(() => {
    setIsAutoRotating(false);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setIsAutoRotating(true), 30000);
  }, []);
  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  useImperativeHandle(ref, () => ({
    swipePeriod(direction: 1 | -1): boolean {
      const idx = PERIODS.indexOf(activePeriod);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= PERIODS.length) return false;
      setActivePeriod(PERIODS[newIdx]);
      pauseRotation();
      return true;
    },
  }), [activePeriod, pauseRotation]);

  // Auto-rotate every 5 seconds — but only across periods that are already
  // in the query cache. Rotating used to fetch every period in turn from a
  // widget mounted on every page; now the rotation shows what has been
  // loaded and a period is only fetched when the user picks it. Ticks while
  // the browser tab is hidden are skipped.
  useEffect(() => {
    if (!isAutoRotating || !isOnScreen) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      setActivePeriod(prev => {
        const start = PERIODS.indexOf(prev);
        for (let step = 1; step < PERIODS.length; step++) {
          const candidate = PERIODS[(start + step) % PERIODS.length];
          if (queryClient.getQueryData(holdingsKey(PERIOD_MAP[candidate])) !== undefined) return candidate;
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoRotating, isOnScreen, queryClient]);

  const handlePeriodClick = useCallback((period: PeriodLabel) => {
    setActivePeriod(period);
    pauseRotation();
  }, [pauseRotation]);

  return (
    <div ref={rootRef} className="flex flex-col h-full" onPointerEnter={pauseRotation} onFocusCapture={pauseRotation}>
      {/* Period filter row */}
      <div className="flex px-4 pt-3 pb-1" role="tablist" aria-label={t('nav.leaderboard')}>
        {PERIODS.map((period) => (
          <button
            type="button"
            role="tab"
            aria-selected={activePeriod === period}
            data-tab-btn
            /* The strip auto-rotates every 5s, so which period is showing has to
               be legible at a glance. This is the attribute the theme layer
               already reads for an active tab. */
            data-active={activePeriod === period ? 'true' : undefined}
            key={period}
            onClick={() => handlePeriodClick(period)}
            className={cn(
              'flex-1 text-xs font-semibold transition-colors duration-150 text-center py-1',
              activePeriod === period ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
              FOCUS_RING,
            )}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Scrollable list — sliding strip */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0 flex transition-transform duration-300 ease-out"
          style={{
            width: `${PERIODS.length * 100}%`,
            transform: `translateX(-${PERIODS.indexOf(activePeriod) * (100 / PERIODS.length)}%)`,
          }}
        >
          {PERIODS.map((period) => (
            <div
              key={period}
              className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
              style={{ width: `${100 / PERIODS.length}%` }}
              aria-hidden={activePeriod !== period}
            >
              <PeriodList period={period} isActive={activePeriod === period} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom fade gradient */}
      <div data-view-all className="relative px-4 pb-2" style={{ marginTop: '-3px' }}>
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        <LiquidGlassBubble2
          label={t('commandCentre.viewAll')}
          onClick={() => navigate('/app/leaderboard')}
          width="100%"
          height="auto"
          className="-translate-y-[6px] [&>div]:!py-2 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent"
        />
      </div>
    </div>
  );
});
