import { useQuery } from '@tanstack/react-query';
import { Trophy, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { Button } from '@/components/ui/button';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import medal3 from '@/assets/medal-3.png';

const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

const formatDHB = (num: number): string => {
  return `${formatNumber(num)} DHB`;
};

export function SidebarLeaderboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-leaderboard', 'holdings', 'all'],
    queryFn: () => getLeaderboard('holdings', 'all'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Only show users with usernames, filter out wallet-only entries
  const entries = (data?.result?.byWalletBalance || [])
    .filter((entry: LeaderboardEntry) => entry.username)
    .slice(0, 50);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <Trophy className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">No leaderboard data yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {entries.map((entry, index) => {
          const rank = index + 1;
          return (
            <div
              key={entry.account}
              onClick={() => handleUserClick(entry)}
              className="flex items-center gap-3 py-2 px-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              {/* Rank */}
              <div className="w-7 flex-shrink-0 flex items-center justify-center">
                {rank <= 3 ? (
                  <div className="medal-shine-container w-6 h-6">
                    <img 
                      src={rank === 1 ? medal1 : rank === 2 ? medal2 : medal3} 
                      alt={`Rank ${rank}`} 
                      className="w-6 h-6 object-contain"
                    />
                    <div 
                      className="medal-shine-overlay"
                      style={{ '--medal-mask': `url(${rank === 1 ? medal1 : rank === 2 ? medal2 : medal3})` } as React.CSSProperties}
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
                displayName={getDisplayName(entry)}
                size="sm"
              />

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm truncate">{getDisplayName(entry)}</div>
                <div className="text-zinc-500 text-xs truncate">{getHandle(entry)}</div>
              </div>

              {/* Value */}
              <div className="text-right flex-shrink-0">
                <span className="text-zinc-400 text-xs">{formatDHB(entry.total ?? 0)}</span>
              </div>
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
}
