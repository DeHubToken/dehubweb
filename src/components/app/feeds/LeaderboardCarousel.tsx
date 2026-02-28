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
import medal4 from '@/assets/medal-4.png';
import medal5 from '@/assets/medal-5.png';
import medal6 from '@/assets/medal-6.png';
import medal7 from '@/assets/medal-7.png';
import medal8 from '@/assets/medal-8.png';
import medal9 from '@/assets/medal-9.png';
import medal10 from '@/assets/medal-10.png';

const MEDALS = [medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10];

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
      {/* Rank + Name */}
      <div className="flex items-center gap-2 mb-2">
        {rank <= 10 ? (
          <div className={`medal-shine-container flex-shrink-0 ${rank <= 3 ? 'w-7 h-7' : 'w-6 h-6'}`}>
            <img src={MEDALS[rank - 1]} alt={`#${rank}`} className={`${rank <= 3 ? 'w-7 h-7' : 'w-6 h-6'} object-contain`} />
            <div 
              className="medal-shine-overlay"
              style={{ '--medal-mask': `url(${MEDALS[rank - 1]})` } as React.CSSProperties}
            />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-lg bg-zinc-700 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white">
            {rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-0.5">
            <span className="relative inline-flex items-baseline shrink min-w-0">
              <span className="text-sm font-semibold text-white truncate">{displayName}</span>
              {badgeUrl && <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" />}
            </span>
          </div>
        </div>
      </div>

      {/* Avatar + Balance */}
      <div className="flex items-center gap-2">
        <LeaderboardUserAvatar
          avatarUrl={avatarUrl}
          fallbackSeed={entry.account}
          displayName={displayName}
          size="sm"
        />
        <span className="text-xs text-zinc-500 tabular-nums">{formatNumber(entry.total)} DHB</span>
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
    .filter((e: LeaderboardEntry) => e.username && e.username.toLowerCase() !== 'dehubdev1')
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
