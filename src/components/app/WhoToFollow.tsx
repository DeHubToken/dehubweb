import { useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getLeaderboard, getMediaUrl, type LeaderboardEntry } from '@/lib/api/dehub';
import { VerifiedBadge } from './VerifiedBadge';

export function WhoToFollow() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['suggestions', 'followers'],
    queryFn: () => getLeaderboard('holdings', 'all'),
    staleTime: 60_000,
  });

  const suggestions = data?.result?.byWalletBalance?.slice(0, 5) || [];

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

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return '0';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
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

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
          <UserPlus className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">No suggestions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((entry) => (
        <div
          key={entry.account}
          onClick={() => handleUserClick(entry)}
          className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-zinc-800/50 transition-colors cursor-pointer"
        >
          <Avatar className="w-10 h-10">
            <AvatarImage src={getAvatarUrl(entry)} />
            <AvatarFallback className="bg-zinc-700 text-white">
              {getDisplayName(entry).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-white text-sm truncate">{getDisplayName(entry)}</span>
              <VerifiedBadge className="w-3.5 h-3.5" />
            </div>
            <span className="text-zinc-500 text-xs">{getHandle(entry)}</span>
          </div>
          <div className="text-right">
            <span className="text-zinc-400 text-xs">{formatNumber(entry.followers)} followers</span>
          </div>
        </div>
      ))}
    </div>
  );
}
