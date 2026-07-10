import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { getBadgeUrl } from '@/lib/staking-badges';
import { BadgeIcon } from '@/components/app/BadgeIcon';

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
const PERIOD_MAP: Record<string, string> = {
  '1D': 'day',
  '1W': 'week',
  '1M': 'month',
  '1Y': 'year',
  'All': 'all',
};

const MEDALS = [medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10];

const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

const formatDHB = (num: number): string => {
  return formatNumber(num);
};

export interface SidebarLeaderboardHandle {
  /** Try to swipe the period. Returns true if consumed, false if at edge. */
  swipePeriod: (direction: 1 | -1) => boolean;
}

/** Renders a single period's leaderboard list — always mounted, visibility toggled by parent */
const PeriodList = memo(function PeriodList({ period, isActive }: { period: string; isActive: boolean }) {
  const navigate = useNavigate();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const apiPeriod = PERIOD_MAP[period] || 'all';

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-leaderboard', 'holdings', apiPeriod],
    queryFn: () => getLeaderboard('holdings', apiPeriod as LeaderboardPeriod),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });

  const balanceOverrides: Record<string, number> = {
    maldoteth: 273298163.18321,
  };
  const badgeBalanceOverrides: Record<string, number> = {
    maldoteth: 273298163.18321,
  };
  const blockedLeaderboardUsers: string[] = ['dehubdev1', 'uss', 'support'];

  const isTimeDelta = apiPeriod !== 'all';

  const entries = (data?.result?.byWalletBalance || [])
    .filter((entry: LeaderboardEntry) => entry.username && !blockedLeaderboardUsers.includes(entry.username.toLowerCase()))
    .map((entry: LeaderboardEntry) => {
      const uname = entry.username?.toLowerCase();
      const totalOverride = uname ? balanceOverrides[uname] : undefined;
      const badgeOverride = uname ? badgeBalanceOverrides[uname] : undefined;
      return {
        ...entry,
        ...(totalOverride !== undefined ? { total: totalOverride } : {}),
        ...(badgeOverride !== undefined ? { badgeBalance: badgeOverride } : {}),
      };
    })
    .sort((a, b) => {
      if (isTimeDelta) {
        return (b.delta ?? 0) - (a.delta ?? 0);
      }
      return (b.total ?? 0) - (a.total ?? 0);
    })
    .slice(0, 50);


  if (!isLoading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
        {apiPeriod !== 'all' ? 'No data for this period yet' : 'No data yet'}
      </div>
    );
  }

  const displayEntries = entries;

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

  const handleUserClick = (entry: LeaderboardEntry) => {
    if (entry.username) {
      navigate(`/${entry.username}`);
    }
  };

  if (isLoading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-1 pr-1">
      {displayEntries.map((entry, index) => {
        const rank = index + 1;
        const isPlaceholder = (entry as any)._isPlaceholder === true;
        return (
          <div
            key={entry.account}
            onClick={() => !isPlaceholder && handleUserClick(entry)}
            className={cn(
              "flex items-center gap-3 py-2 px-4 transition-colors",
              isPlaceholder ? 'opacity-40' : cn('cursor-pointer', isLightTheme ? 'hover:bg-zinc-100' : 'hover:bg-zinc-800/50')
            )}
          >
            {/* Rank */}
            <div className="w-7 flex-shrink-0 flex items-center justify-center">
              {rank <= 10 ? (
                <div className={`medal-shine-container ${rank <= 3 ? 'w-10 h-10' : 'w-6 h-6'}`}>
                  <img 
                    src={MEDALS[rank - 1]} 
                    alt={`Rank ${rank}`} 
                    className={`${rank <= 3 ? 'w-10 h-10' : 'w-6 h-6'} object-contain`}
                  />
                  <div 
                    className="medal-shine-overlay"
                    style={{ '--medal-mask': `url(${MEDALS[rank - 1]})` } as React.CSSProperties}
                  />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-lg bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
                  {rank}
                </div>
              )}
            </div>

            {/* Avatar */}
            {isPlaceholder ? (
              <div className="w-8 h-8 rounded-md bg-zinc-700/50 flex-shrink-0" />
            ) : (
              <LeaderboardUserAvatar
                avatarUrl={getAvatarUrl(entry)}
                fallbackSeed={entry.account}
                displayName={getDisplayName(entry)}
                size="sm"
              />
            )}

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-0 min-w-0">
                <span className="relative inline-flex items-baseline shrink min-w-0">
                  <span className="font-semibold text-white text-sm truncate min-w-0">
                    {isPlaceholder ? '—' : getDisplayName(entry)}
                  </span>
                  {!isPlaceholder && (() => {
                    const badgeUrl = getBadgeUrl(entry.badgeBalance || entry.total);
                    return badgeUrl ? (
                      <BadgeIcon badgeBalance={entry.badgeBalance || entry.total} className="w-[9px] h-[9px] absolute -top-0.5 -right-3" />
                    ) : null;
                  })()}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500 truncate">{isPlaceholder ? '—' : getHandle(entry)}</span>
                <span className="flex-1" />
                <span className="text-zinc-400 shrink-0 tabular-nums">
                  {isPlaceholder ? '—' : (() => {
                    const isTimeDelta = period !== 'All';
                    const displayValue = isTimeDelta && entry.delta !== undefined ? entry.delta : (entry.total ?? 0);
                    const prefix = isTimeDelta && entry.delta !== undefined && entry.delta > 0 ? '+' : '';
                    return `${prefix}${formatDHB(displayValue)}`;
                  })()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export const SidebarLeaderboard = forwardRef<SidebarLeaderboardHandle>(function SidebarLeaderboard(_props, ref) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activePeriod, setActivePeriod] = useState<string>('All');
  const [isAutoRotating, setIsAutoRotating] = useState(true);

  useImperativeHandle(ref, () => ({
    swipePeriod(direction: 1 | -1): boolean {
      const idx = PERIODS.indexOf(activePeriod as typeof PERIODS[number]);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= PERIODS.length) return false;
      setActivePeriod(PERIODS[newIdx]);
      setIsAutoRotating(false);
      setTimeout(() => setIsAutoRotating(true), 30000);
      return true;
    },
  }), [activePeriod]);

  // Auto-rotate through periods every 5 seconds
  useEffect(() => {
    if (!isAutoRotating) return;
    const interval = setInterval(() => {
      setActivePeriod(prev => {
        const idx = PERIODS.indexOf(prev as typeof PERIODS[number]);
        return PERIODS[(idx + 1) % PERIODS.length];
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoRotating]);

  const handlePeriodClick = useCallback((period: string) => {
    setActivePeriod(period);
    setIsAutoRotating(false);
    setTimeout(() => setIsAutoRotating(true), 30000);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Period filter row */}
      <div className="flex px-4 pt-0 pb-1">
        {PERIODS.map((period) => (
          <button
            data-tab-btn
            key={period}
            onClick={() => handlePeriodClick(period)}
            className={`flex-1 text-xs font-semibold transition-colors duration-150 text-center py-1 ${
              activePeriod === period
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
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
            transform: `translateX(-${PERIODS.indexOf(activePeriod as typeof PERIODS[number]) * (100 / PERIODS.length)}%)`,
          }}
        >
          {PERIODS.map((period) => (
            <div
              key={period}
              className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
              style={{ width: `${100 / PERIODS.length}%` }}
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
