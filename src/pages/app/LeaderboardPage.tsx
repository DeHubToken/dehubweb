/**
 * Leaderboard Page
 * ================
 * Displays top DHB token holders and tippers from the DeHub API.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Wallet, ArrowUpRight, CreditCard, Users, Heart, UserCheck } from 'lucide-react';
import trophyIcon from '@/assets/trophy-icon.png';
import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import medal3 from '@/assets/medal-3.png';
import medal4 from '@/assets/medal-4.png';
import medal5 from '@/assets/medal-5.png';

import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { getLeaderboard, type LeaderboardSortMode, type LeaderboardEntry, type LeaderboardPeriod } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useBatchBadgeBalances } from '@/hooks/use-badge-balance';

type CategoryType = 'holdings' | 'sentTips' | 'receivedTips' | 'followers' | 'likes' | 'subscribers';

const categories: { id: CategoryType; label: string; icon: typeof Wallet; apiSort: LeaderboardSortMode }[] = [
  { id: 'holdings', label: 'Holdings', icon: Wallet, apiSort: 'holdings' },
  { id: 'sentTips', label: 'Spent', icon: ArrowUpRight, apiSort: 'sentTips' },
  { id: 'receivedTips', label: 'Paid', icon: CreditCard, apiSort: 'receivedTips' },
  { id: 'followers', label: 'Followers', icon: Users, apiSort: 'holdings' },
  { id: 'likes', label: 'Likes', icon: Heart, apiSort: 'holdings' },
  { id: 'subscribers', label: 'Subscribers', icon: UserCheck, apiSort: 'holdings' },
];

const timePeriods: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All Time' },
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
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryType>('holdings');
  const [timePeriod, setTimePeriod] = useState<LeaderboardPeriod>('all');
  const [shimmerKey, setShimmerKey] = useState(0);
  const navigate = useNavigate();

  // Map category to API sort mode
  const apiSortMode = categories.find(c => c.id === category)?.apiSort || 'holdings';

  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard', apiSortMode, timePeriod],
    queryFn: () => getLeaderboard(apiSortMode, timePeriod),
    staleTime: 60_000, // 1 minute
    placeholderData: (prev) => prev, // Keep previous data while loading new tab
  });

  // Categories that require client-side sorting (not natively supported by API)
  const clientSortedCategories: CategoryType[] = ['followers', 'likes', 'subscribers'];
  const isClientSorted = clientSortedCategories.includes(category);

  // Manual balance overrides (username -> total override)
  const balanceOverrides: Record<string, number> = {};

  // Usernames to exclude from leaderboard
  const blockedLeaderboardUsers = ['microsoft'];

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
    
    // Client-side sorting for social metrics
    if (category === 'followers') {
      list = [...list].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
    } else if (category === 'likes') {
      list = [...list].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    } else if (category === 'subscribers') {
      list = [...list].sort((a, b) => (b.subscribers ?? 0) - (a.subscribers ?? 0));
    }
    
    // Filter out entries with 0 value for client-sorted categories
    if (isClientSorted) {
      list = list.filter(entry => {
        const value = entry[category as keyof LeaderboardEntry];
        return typeof value === 'number' && value > 0;
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
    
    return list;
  }, [data, searchQuery, category, isClientSorted]);

  // Batch fetch badge balances for all visible entries
  const walletAddresses = useMemo(() => entries.map(e => e.account), [entries]);
  const { balances: badgeBalances } = useBatchBadgeBalances(walletAddresses);

  const handleUserClick = (entry: LeaderboardEntry) => {
    if (entry.username) {
      navigate(`/${entry.username}`);
    }
  };

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

  // Check if we're viewing a time-based holdings period (shows delta)
  const isHoldingsDelta = category === 'holdings' && timePeriod !== 'all';
  const hasHistoricalData = data?.hasHistoricalData !== false;

  const getSortValue = (entry: LeaderboardEntry): number => {
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
        // For time-based holdings, use delta if available
        if (isHoldingsDelta && entry.delta !== undefined) {
          return entry.delta;
        }
        return entry.total ?? 0;
    }
  };

  const formatDisplayValue = (entry: LeaderboardEntry): string => {
    const value = getSortValue(entry);
    if (isHoldingsDelta && hasHistoricalData) {
      return `+${formatNumber(value)} DHB`;
    }
    if (category === 'holdings' || category === 'sentTips' || category === 'receivedTips') {
      return formatDHB(value);
    }
    return formatNumber(value);
  };

  const currentCategory = categories.find(c => c.id === category);

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden">
            <img src={trophyIcon} alt="Trophy" className="w-11 h-11 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">DHB Leaderboard</h1>
            <p className="text-zinc-500 text-sm">Top token holders and tippers</p>
          </div>
        </div>

        {/* Category Tabs - Horizontally scrollable */}
        <div className="relative mb-3">
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
          <div className="flex gap-2 overflow-x-auto scrollbar-invisible pb-1">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { setCategory(cat.id); setShimmerKey(k => k + 1); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Period Tabs - Hidden for client-sorted categories */}
        {!isClientSorted && (
          <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-invisible">
            {timePeriods.map((period) => {
              const isActive = timePeriod === period.id;
              return (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => {
                    setTimePeriod(period.id);
                    setShimmerKey(k => k + 1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        {/* Table Header - only render when we have entries to avoid border flash */}
        {entries.length > 0 && (
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-zinc-800 text-zinc-500 text-sm font-medium">
            <div className="col-span-1">Rank</div>
            <div className="col-span-5">User</div>
            <div className="col-span-6 text-right">{currentCategory?.label || 'Value'}</div>
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
            <p className="text-zinc-500">Failed to load leaderboard</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && entries.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-500">No users found</p>
          </div>
        )}

        {/* Table Rows */}
        {!isLoading && !error && entries.length > 0 && (
          <div>
            {entries.map((entry, index) => {
              const rank = index + 1;
              return (
                <div
                  key={entry.account}
                  onClick={() => handleUserClick(entry)}
                  className="grid grid-cols-12 gap-2 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-800/50 transition-colors items-center cursor-pointer"
                >
                  {/* Rank */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-center w-12">
                    {rank <= 5 ? (
                      <div className={`medal-shine-container ${rank <= 3 ? 'w-12 h-12' : 'w-8 h-8'}`}>
                        <img 
                          src={[medal1, medal2, medal3, medal4, medal5][rank - 1]} 
                          alt={`Rank ${rank}`} 
                          className={`${rank <= 3 ? 'w-12 h-12' : 'w-8 h-8'} object-contain`}
                        />
                        <div 
                          key={shimmerKey}
                          className="medal-shine-overlay"
                          style={{ '--medal-mask': `url(${[medal1, medal2, medal3, medal4, medal5][rank - 1]})` } as React.CSSProperties}
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
                        <span className="font-semibold text-white truncate">{getDisplayName(entry)}</span>
                        {(() => {
                          const badgeUrl = getBadgeUrl(entry.badgeBalance ?? badgeBalances[entry.account.toLowerCase()]);
                          return badgeUrl ? <img src={badgeUrl} alt="Badge" className="w-3 h-3 shrink-0 -mt-2" /> : null;
                        })()}
                      </div>
                      <span className="text-zinc-500 text-sm">{getHandle(entry)}</span>
                    </div>
                  </div>

                  {/* Value */}
                  <div className="col-span-3 sm:col-span-6 text-right text-white font-medium">
                    {formatDisplayValue(entry)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}