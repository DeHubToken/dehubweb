/**
 * Leaderboard Carousel for Home Feed
 * ===================================
 * Horizontal scrollable carousel showing top leaderboard holders.
 */

import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { getBadgeUrl } from '@/lib/staking-badges';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import medal3 from '@/assets/medal-3.png';

const MEDALS = [medal1, medal2, medal3];

const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

const LeaderboardCard = memo(function LeaderboardCard({
  entry,
  rank,
  onClick,
}: {
  entry: LeaderboardEntry;
  rank: number;
  onClick: () => void;
}) {
  const avatarUrl = entry.avatarUrl && entry.account
    ? buildAvatarUrl(entry.account, entry.avatarUrl)
    : null;
  const displayName = entry.userDisplayName || entry.username || `${entry.account.slice(0, 6)}...`;
  const handle = entry.username ? `@${entry.username}` : `${entry.account.slice(0, 6)}...`;
  const badgeUrl = getBadgeUrl(entry.badgeBalance || entry.total);

  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 w-[160px] bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 cursor-pointer hover:bg-white/[0.08] transition-colors"
    >
      {/* Rank + Medal */}
      <div className="flex items-center justify-between mb-2">
        {rank <= 3 ? (
          <img src={MEDALS[rank - 1]} alt={`#${rank}`} className="w-7 h-7 object-contain" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-white">
            {rank}
          </div>
        )}
        <span className="text-xs text-zinc-500 tabular-nums">{formatNumber(entry.total)} DHB</span>
      </div>

      {/* Avatar + Name */}
      <div className="flex items-center gap-2">
        <LeaderboardUserAvatar
          avatarUrl={avatarUrl}
          fallbackSeed={entry.account}
          displayName={displayName}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-0.5">
            <span className="text-sm font-semibold text-white truncate">{displayName}</span>
            {badgeUrl && <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0" />}
          </div>
          <span className="text-xs text-zinc-500 truncate block">{handle}</span>
        </div>
      </div>
    </div>
  );
});

export const LeaderboardCarousel = memo(function LeaderboardCarousel() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['home-leaderboard-carousel', 'holdings', 'all'],
    queryFn: () => getLeaderboard('holdings', 'all'),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false,
  });

  const entries = (data?.result?.byWalletBalance || [])
    .filter((e: LeaderboardEntry) => e.username)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 15);

  if (entries.length === 0) return null;

  return (
    <div className="bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/[0.08] rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Leaderboard
        </h3>
        <button
          onClick={() => navigate('/app/leaderboard')}
          className="text-zinc-400 text-sm hover:text-white flex items-center gap-1"
        >
          See all <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/40 to-transparent pointer-events-none z-10" />
        <SwipeableCarousel className="flex gap-2 overflow-x-auto scrollbar-hide pr-8">
          {entries.map((entry, i) => (
            <LeaderboardCard
              key={entry.account}
              entry={entry}
              rank={i + 1}
              onClick={() => entry.username && navigate(`/${entry.username}`)}
            />
          ))}
        </SwipeableCarousel>
      </div>
    </div>
  );
});

export default LeaderboardCarousel;
