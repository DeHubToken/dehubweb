import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { Button } from '@/components/ui/button';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useBatchBadgeBalances } from '@/hooks/use-badge-balance';
import { getBadgeUrl } from '@/lib/staking-badges';
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

const PERIODS = ['1d', '1w', '1m', '1y', 'All'] as const;
const PERIOD_MAP: Record<string, string> = {
  '1d': 'day',
  '1w': 'week',
  '1m': 'month',
  '1y': 'year',
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
function PeriodList({ period, isActive }: { period: string; isActive: boolean }) {
  const navigate = useNavigate();
  const apiPeriod = PERIOD_MAP[period] || 'all';

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-leaderboard', 'holdings', apiPeriod],
    queryFn: () => getLeaderboard('holdings', apiPeriod as LeaderboardPeriod),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const balanceOverrides: Record<string, number> = {
    maldoteth: 273298163.18321,
  };
  const badgeBalanceOverrides: Record<string, number> = {
    maldoteth: 273298163.18321,
  };
  const blockedLeaderboardUsers: string[] = [];

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
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 50);

  const walletAddresses = entries.map((e: LeaderboardEntry) => e.account);
  const { balances: badgeBalances } = useBatchBadgeBalances(walletAddresses);

  const displayEntries = entries.length > 0 ? entries : Array.from({ length: 10 }, (_, i) => ({
    account: `placeholder-${i}`,
    total: 0,
    username: undefined,
    userDisplayName: undefined,
    avatarUrl: undefined,
    sentTips: 0,
    receivedTips: 0,
    _isPlaceholder: true,
  })) as (LeaderboardEntry & { _isPlaceholder?: boolean })[];

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
            className={`flex items-center gap-3 py-2 px-4 transition-colors ${isPlaceholder ? 'opacity-40' : 'hover:bg-zinc-800/50 cursor-pointer'}`}
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
                    const badgeUrl = getBadgeUrl(entry.badgeBalance || badgeBalances[entry.account.toLowerCase()] || entry.total);
                    return badgeUrl ? (
                      <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" />
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
}

export const SidebarLeaderboard = forwardRef<SidebarLeaderboardHandle>(function SidebarLeaderboard(_props, ref) {
  const navigate = useNavigate();
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
      <div className="flex items-center justify-between px-4 py-2">
        {PERIODS.map((period) => (
          <button
            key={period}
            onClick={() => handlePeriodClick(period)}
            className={`text-xs font-medium transition-colors ${
              activePeriod === period
                ? 'text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Scrollable list — all periods mounted, visibility toggled */}
      <div className="flex-1 overflow-hidden relative">
        {PERIODS.map((period) => {
          const isActive = activePeriod === period;
          return (
            <div
              key={period}
              className={
                isActive
                  ? 'h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent animate-fade-in'
                  : 'h-0 overflow-hidden invisible absolute'
              }
            >
              <PeriodList period={period} isActive={isActive} />
            </div>
          );
        })}
      </div>

      {/* Bottom fade gradient */}
      <div className="relative">
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        <Button
          variant="ghost"
          onClick={() => navigate('/app/leaderboard')}
          className="w-full mt-2 text-white/50 hover:text-white hover:bg-transparent"
        >
          View All
        </Button>
      </div>
    </div>
  );
});
