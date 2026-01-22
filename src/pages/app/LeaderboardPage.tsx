/**
 * Leaderboard Page
 * ================
 * Displays top DHB token holders and tippers from the DeHub API.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Trophy, Loader2, ArrowUpRight, ArrowDownLeft, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLeaderboard, getMediaUrl, type LeaderboardSortMode, type LeaderboardEntry } from '@/lib/api/dehub';

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

const formatNumber = (num: number): string => {
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
  const [sortMode, setSortMode] = useState<LeaderboardSortMode>('holdings');
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard', sortMode],
    queryFn: () => getLeaderboard(sortMode),
    staleTime: 60_000, // 1 minute
  });

  const entries = useMemo(() => {
    const list = data?.result?.byWalletBalance || [];
    if (!searchQuery.trim()) return list;
    
    const query = searchQuery.toLowerCase();
    return list.filter((entry) => 
      entry.username?.toLowerCase().includes(query) ||
      entry.userDisplayName?.toLowerCase().includes(query) ||
      entry.account.toLowerCase().includes(query)
    );
  }, [data, searchQuery]);

  const handleUserClick = (entry: LeaderboardEntry) => {
    if (entry.username) {
      navigate(`/${entry.username}`);
    }
  };

  const getAvatarUrl = (entry: LeaderboardEntry) => {
    if (entry.avatarUrl) {
      return getMediaUrl(entry.avatarUrl);
    }
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${entry.account}`;
  };

  const getDisplayName = (entry: LeaderboardEntry) => {
    return entry.userDisplayName || entry.username || `${entry.account.slice(0, 6)}...${entry.account.slice(-4)}`;
  };

  const getHandle = (entry: LeaderboardEntry) => {
    if (entry.username) return `@${entry.username}`;
    return `${entry.account.slice(0, 6)}...${entry.account.slice(-4)}`;
  };

  const getSortValue = (entry: LeaderboardEntry): number => {
    switch (sortMode) {
      case 'sentTips':
        return entry.sentTips;
      case 'receivedTips':
        return entry.receivedTips;
      default:
        return entry.total;
    }
  };

  const getSortLabel = (): string => {
    switch (sortMode) {
      case 'sentTips':
        return 'Tips Sent';
      case 'receivedTips':
        return 'Tips Received';
      default:
        return 'Holdings';
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center">
            <Trophy className="w-6 h-6 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">DHB Leaderboard</h1>
            <p className="text-zinc-500 text-sm">Top token holders and tippers</p>
          </div>
        </div>

        {/* Sort Tabs */}
        <Tabs value={sortMode} onValueChange={(v) => setSortMode(v as LeaderboardSortMode)} className="mb-4">
          <TabsList className="bg-zinc-800 w-full grid grid-cols-3">
            <TabsTrigger value="holdings" className="data-[state=active]:bg-zinc-700 gap-1.5">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Holdings</span>
            </TabsTrigger>
            <TabsTrigger value="sentTips" className="data-[state=active]:bg-zinc-700 gap-1.5">
              <ArrowUpRight className="w-4 h-4" />
              <span className="hidden sm:inline">Sent Tips</span>
            </TabsTrigger>
            <TabsTrigger value="receivedTips" className="data-[state=active]:bg-zinc-700 gap-1.5">
              <ArrowDownLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Received</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
        {/* Table Header */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-zinc-800 text-zinc-500 text-sm font-medium">
          <div className="col-span-1">Rank</div>
          <div className="col-span-4">User</div>
          <div className="col-span-3 text-right">{getSortLabel()}</div>
          <div className="col-span-2 text-right">Sent</div>
          <div className="col-span-2 text-right">Received</div>
        </div>

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
          <div className="divide-y divide-zinc-800">
            {entries.map((entry, index) => {
              const rank = index + 1;
              return (
                <div
                  key={entry.account}
                  onClick={() => handleUserClick(entry)}
                  className="grid grid-cols-12 gap-2 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-800/50 transition-colors items-center cursor-pointer"
                >
                  {/* Rank */}
                  <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(rank)}`}>
                      {rank}
                    </div>
                  </div>

                  {/* User */}
                  <div className="col-span-10 sm:col-span-4 flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={getAvatarUrl(entry)} />
                      <AvatarFallback className="bg-zinc-700 text-white">
                        {getDisplayName(entry).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-white truncate">{getDisplayName(entry)}</span>
                      </div>
                      <span className="text-zinc-500 text-sm">{getHandle(entry)}</span>
                    </div>
                  </div>

                  {/* Stats - Mobile */}
                  <div className="col-span-12 sm:hidden grid grid-cols-3 gap-2 text-sm mt-2 pl-9">
                    <div>
                      <span className="text-zinc-500 text-xs">{getSortLabel()}</span>
                      <p className="text-white font-medium">{formatDHB(getSortValue(entry))}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Sent</span>
                      <p className="text-orange-400 font-medium">{formatNumber(entry.sentTips)}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Received</span>
                      <p className="text-green-400 font-medium">{formatNumber(entry.receivedTips)}</p>
                    </div>
                  </div>

                  {/* Stats - Desktop */}
                  <div className="hidden sm:block col-span-3 text-right text-white font-medium">
                    {formatDHB(getSortValue(entry))}
                  </div>
                  <div className="hidden sm:block col-span-2 text-right text-orange-400 font-medium">
                    {formatNumber(entry.sentTips)}
                  </div>
                  <div className="hidden sm:block col-span-2 text-right text-green-400 font-medium">
                    {formatNumber(entry.receivedTips)}
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
