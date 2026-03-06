/**
 * Leaderboard Page
 * ================
 * Displays top DHB token holders and tippers from the DeHub API.
 */

import { useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Wallet, ArrowUpRight, CreditCard, Users, Heart, UserCheck, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import trophyIcon from '@/assets/trophy-icon.png';
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

import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt, AuthPrompt } from '@/components/app/AuthPrompt';
import { supabase } from '@/integrations/supabase/client';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { getLeaderboard, type LeaderboardSortMode, type LeaderboardEntry, type LeaderboardPeriod } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { getBadgeUrl } from '@/lib/staking-badges';


type CategoryType = 'holdings' | 'sentTips' | 'receivedTips' | 'followers' | 'likes' | 'subscribers';

const categories: { id: CategoryType; labelKey: string; icon: typeof Wallet; apiSort: LeaderboardSortMode }[] = [
  { id: 'holdings', labelKey: 'leaderboard.holdings', icon: Wallet, apiSort: 'holdings' },
  { id: 'sentTips', labelKey: 'leaderboard.spent', icon: ArrowUpRight, apiSort: 'sentTips' },
  { id: 'receivedTips', labelKey: 'leaderboard.earned', icon: CreditCard, apiSort: 'receivedTips' },
  { id: 'followers', labelKey: 'leaderboard.followers', icon: Users, apiSort: 'followers' },
  { id: 'likes', labelKey: 'leaderboard.likes', icon: Heart, apiSort: 'likes' },
  { id: 'subscribers', labelKey: 'leaderboard.subscribers', icon: UserCheck, apiSort: 'subscribers' },
];

const timePeriods: { id: LeaderboardPeriod; labelKey: string }[] = [
  { id: 'day', labelKey: 'leaderboard.day' },
  { id: 'week', labelKey: 'leaderboard.week' },
  { id: 'month', labelKey: 'leaderboard.month' },
  { id: 'year', labelKey: 'leaderboard.year' },
  { id: 'all', labelKey: 'leaderboard.allTime' },
];

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return 'bg-yellow-500 text-black';
    case 2:
      return 'bg-zinc-400 text-black';
    case 3:
      return 'bg-amber-600 text-white';
    default:
      return 'bg-zinc-700 text-white';
  }
};

const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return '0';
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
};

const formatDHB = (num: number): string => {
  return `${formatNumber(num)} DHB`;
};

export default function LeaderboardPage() {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    // Force scroll to top immediately and repeatedly to override any residual scroll position
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Additional attempts after paint to beat any async scroll restoration
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    
    const t = setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 50);
    
    return () => clearTimeout(t);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryType>('holdings');
  const [timePeriod, setTimePeriod] = useState<LeaderboardPeriod>('all');
  const [shimmerKey, setShimmerKey] = useState(0);
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [visibleCount, setVisibleCount] = useState(25);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, walletAddress } = useAuth();
  const { isOpen: isAuthOpen, requireAuth, close: closeAuth } = useAuthPrompt();

  // Map category to API sort mode
  const apiSortMode = categories.find(c => c.id === category)?.apiSort || 'holdings';

  const handleRefreshMe = useCallback(async () => {
    if (refreshCooldown || isRefreshing) return;

    requireAuth(async () => {
      if (!walletAddress) {
        toast.error(t('leaderboard.noWalletAddress'));
        return;
      }

      setIsRefreshing(true);
      try {
        const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl('');
        const baseUrl = publicUrl.replace('/storage/v1/object/public/stories/', '');
        const fnUrl = `${baseUrl}/functions/v1/refresh-leaderboard-user?address=${walletAddress}`;
        
        const res = await fetch(fnUrl);
        const result = await res.json();

        if (!res.ok || !result.success) {
          toast.error(result.error || t('leaderboard.refreshFailed'));
          return;
        }

        if (result.added) {
          toast.success(t('leaderboard.addedToLeaderboard', { balance: (result.balance as number).toLocaleString() }));
        } else {
          toast.info(result.reason || t('leaderboard.balanceTooLow', { balance: (result.balance as number).toLocaleString() }));
        }

        // Refetch leaderboard data
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

        // Start cooldown
        setRefreshCooldown(true);
        setTimeout(() => setRefreshCooldown(false), 30_000);
      } catch (err) {
        console.error('Refresh failed:', err);
        toast.error(t('leaderboard.refreshFailed'));
      } finally {
        setIsRefreshing(false);
      }
    });
  }, [refreshCooldown, isRefreshing, requireAuth, walletAddress, queryClient]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard', apiSortMode, timePeriod],
    queryFn: () => getLeaderboard(apiSortMode, timePeriod),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });


  // Manual balance overrides (username -> total override)
  const balanceOverrides: Record<string, number> = {
    maldoteth: 273298163.18321,
  };

  // Usernames to exclude from leaderboard
  const blockedLeaderboardUsers: string[] = ['dehubdev1', 'uss'];

  // Check if we're viewing a time-based period (shows delta)
  const isTimeDelta = timePeriod !== 'all';
  const hasHistoricalData = data?.hasHistoricalData !== false;

  const getSortValue = useCallback((entry: LeaderboardEntry): number => {
    // For time-based periods, use delta if available
    if (isTimeDelta && entry.delta !== undefined) {
      return entry.delta;
    }
    switch (category) {
      case 'sentTips':
        return entry.sentTips ?? 0;
      case 'receivedTips':
        return entry.receivedTips ?? 0;
      case 'followers':
        return entry.followers ?? 0;
      case 'likes':
        return entry.likes ?? 0;
      case 'subscribers':
        return entry.subscribers ?? 0;
      default:
        return entry.total ?? 0;
    }
  }, [isTimeDelta, category]);

  const entries = useMemo(() => {
    let list = data?.result?.byWalletBalance || [];
    
    // Filter out wallet-only entries (no username) and blocked users
    list = list.filter(entry => entry.username && !blockedLeaderboardUsers.includes(entry.username.toLowerCase()));

    // Apply manual balance overrides (All Time only)
    if (timePeriod === 'all') {
      list = list.map(entry => {
        const override = entry.username ? balanceOverrides[entry.username.toLowerCase()] : undefined;
        if (override !== undefined) {
          return { ...entry, total: override };
        }
        return entry;
      });
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter((entry) => 
        entry.username?.toLowerCase().includes(query) ||
        entry.userDisplayName?.toLowerCase().includes(query) ||
        entry.account.toLowerCase().includes(query)
      );
    }

    // Sort by current direction
    list = [...list].sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return list;
  }, [data, searchQuery, category, sortDirection, timePeriod, getSortValue]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(25);
  }, [category, timePeriod, searchQuery, sortDirection]);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => prev + 25);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [entries.length]);

  const visibleEntries = useMemo(() => entries.slice(0, visibleCount), [entries, visibleCount]);
  const hasMore = visibleCount < entries.length;

  // Live avatar enrichment: fetch fresh avatars for visible entries
  const visibleAccounts = useMemo(() => visibleEntries.map(e => e.account), [visibleEntries]);
  useLeaderboardAvatars(visibleAccounts);
  const getAvatarOverride = useAvatarOverrides();

  const handleUserClick = (entry: LeaderboardEntry) => {
    if (entry.username) {
      navigate(`/${entry.username}`);
    }
  };

  const getAvatarUrl = (entry: LeaderboardEntry) => {
    // Prefer fresh avatar from live enrichment, fall back to cached
    const override = getAvatarOverride(entry.account);
    const avatarPath = override?.avatarUrl ?? entry.avatarUrl;
    if (avatarPath && entry.account) {
      return buildAvatarUrl(entry.account, avatarPath);
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


  const formatDisplayValue = (entry: LeaderboardEntry): string => {
    const value = getSortValue(entry);
    if (isTimeDelta && hasHistoricalData && entry.delta !== undefined && entry.delta !== 0) {
      const prefix = value > 0 ? '+' : '';
      if (category === 'holdings' || category === 'sentTips' || category === 'receivedTips') {
        return `${prefix}${formatNumber(value)} DHB`;
      }
      return `${prefix}${formatNumber(value)}`;
    }
    if (category === 'holdings' || category === 'sentTips' || category === 'receivedTips') {
      return formatDHB(value);
    }
    return formatNumber(value);
  };

  const currentCategory = categories.find(c => c.id === category);

  return (
    <div className="min-h-screen px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-2">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden">
            <img src={trophyIcon} alt="Trophy" className="w-11 h-11 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('leaderboard.title')}</h1>
            <p className="text-zinc-500 text-sm">{t('leaderboard.subtitle')}</p>
          </div>
        </div>

        {/* Category Tabs - Horizontally scrollable */}
        <div className="relative mb-3">
          <GlassFilterRow
            items={categories.map((cat) => ({ key: cat.id, label: <span className="flex items-center gap-1.5"><cat.icon className="w-4 h-4" />{t(cat.labelKey)}</span> }))}
            activeKey={category}
            onSelect={(key) => { setCategory(key as CategoryType); setSortDirection('desc'); }}
            borderRadius="0.75rem"
            buttonClassName="px-3 py-2 rounded-xl text-sm"
          />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-20" />
        </div>

        {/* Time Period Tabs + Sort Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <GlassFilterRow
            items={timePeriods.map((p) => ({ key: p.id, label: t(p.labelKey) }))}
            activeKey={timePeriod}
            onSelect={(key) => { setTimePeriod(key as LeaderboardPeriod); setShimmerKey(k => k + 1); setSortDirection('desc'); }}
            buttonClassName="text-sm"
          />
          <button
            type="button"
            onClick={() => setSortDirection(d => d === 'desc' ? 'asc' : 'desc')}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
            title={sortDirection === 'desc' ? t('leaderboard.highestFirst') : t('leaderboard.lowestFirst')}
          >
            {sortDirection === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Search + Refresh */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder={t('leaderboard.searchUsers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
            />
          </div>
          {category === 'holdings' && (
            <button
              type="button"
              onClick={handleRefreshMe}
              disabled={isRefreshing || refreshCooldown}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title={refreshCooldown ? t('leaderboard.cooldownActive') : t('leaderboard.refreshPosition')}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        {/* Table Header - only render when we have entries to avoid border flash */}
        {entries.length > 0 && (
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-zinc-800 text-zinc-500 text-sm font-medium">
            <div className="col-span-1 text-center -ml-[5.5px]">{t('leaderboard.rank')}</div>
            <div className="col-span-5">{t('leaderboard.user')}</div>
            <div className="col-span-6 text-right">{currentCategory ? t(currentCategory.labelKey) : t('leaderboard.value')}</div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-20">
            <p className="text-zinc-500">{t('leaderboard.failedToLoad')}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && entries.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-500">
              {timePeriod !== 'all' 
                ? t('leaderboard.noDataForPeriod', { defaultValue: 'No data available for this period yet' })
                : t('leaderboard.noUsersFound')}
            </p>
          </div>
        )}

        {/* Table Rows */}
        {!isLoading && !error && entries.length > 0 && (
          <div>
            {visibleEntries.map((entry, index) => {
              const rank = index + 1;
              return (
                <div
                  key={entry.account}
                  onClick={() => handleUserClick(entry)}
                  className="grid grid-cols-12 gap-2 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-800/50 transition-colors items-center cursor-pointer"
                >
                  {/* Rank */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-center -ml-[5.5px]">
                    {rank <= 10 ? (
                      <div className={`medal-shine-container ${rank <= 3 ? 'w-12 h-12' : 'w-8 h-8'}`}>
                        <img 
                          src={[medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10][rank - 1]} 
                          alt={`Rank ${rank}`} 
                          className={`${rank <= 3 ? 'w-12 h-12' : 'w-8 h-8'} object-contain`}
                        />
                        <div 
                          key={shimmerKey}
                          className="medal-shine-overlay"
                          style={{ '--medal-mask': `url(${[medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10][rank - 1]})` } as React.CSSProperties}
                        />
                      </div>
                    ) : (
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${getRankStyle(rank)}`}>
                        {rank}
                      </div>
                    )}
                  </div>

                  {/* User */}
                  <div className="col-span-7 sm:col-span-5 flex items-center gap-3">
                    <LeaderboardUserAvatar
                      avatarUrl={getAvatarUrl(entry)}
                      fallbackSeed={entry.account}
                      displayName={getDisplayName(entry)}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="relative inline-flex items-baseline shrink min-w-0">
                          <span className="font-semibold text-white truncate">{getDisplayName(entry)}</span>
                          {(() => {
                            const badgeUrl = getBadgeUrl(entry.badgeBalance || entry.total, entry.username);
                            return badgeUrl ? <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" /> : null;
                          })()}
                        </span>
                      </div>
                      <span className="text-zinc-500 text-sm">{getHandle(entry)}</span>
                    </div>
                  </div>

                  {/* Value */}
                  <div className={`col-span-3 sm:col-span-6 text-right font-medium ${
                    isTimeDelta && entry.delta !== undefined && Math.abs(entry.delta) > 0.01 && entry.delta > 0 ? 'text-green-400' :
                    isTimeDelta && entry.delta !== undefined && Math.abs(entry.delta) > 0.01 && entry.delta < 0 ? 'text-red-400' :
                    'text-white'
                  }`}>
                    {formatDisplayValue(entry)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {!isLoading && !error && entries.length > 0 && (
          <div ref={sentinelRef} className="py-4 flex justify-center">
            {hasMore && <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />}
          </div>
        )}
      </div>

      <AuthPrompt isOpen={isAuthOpen} onClose={closeAuth} />
    </div>
  );
}