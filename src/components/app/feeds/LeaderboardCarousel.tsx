/**
 * Leaderboard Carousel for Home Feed
 * ===================================
 * Horizontal scrollable carousel showing top leaderboard holders.
 */

import { memo } from 'react';
import { DhbCoin } from '@/components/app/DhbAmount';
import { useQuery } from '@tanstack/react-query';
import { Trophy, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { AppState } from '@/components/app/AppState';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { applyLeaderboardRules, formatLeaderboardNumber, isHidden } from '@/lib/leaderboard-rules';
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

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

const LeaderboardCard = memo(function LeaderboardCard({
  entry,
  rank,
}: {
  entry: LeaderboardEntry;
  rank: number;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const avatarUrl = entry.avatarUrl && entry.account
    ? buildAvatarUrl(entry.account, entry.avatarUrl)
    : null;
  const displayName = entry.userDisplayName || entry.username || `${entry.account.slice(0, 6)}...`;
  const hidden = isHidden(entry);

  return (
    <Link
      to={`/${entry.username}`}
      aria-label={`${t('leaderboard.rankN', { rank })} · ${displayName}`}
      className={cn(
        "flex-shrink-0 w-[160px] rounded-xl p-3 cursor-pointer transition-colors block",
        isLightTheme
          ? "bg-zinc-100 border border-zinc-200 hover:bg-zinc-200"
          : "bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]",
        FOCUS_RING,
      )}
    >
      {/* Rank + Name */}
      <div className="flex items-center gap-2 mb-2">
        {rank <= 10 ? (
          <div
            className={`medal-shine-container flex-shrink-0 ${rank <= 3 ? 'w-7 h-7' : 'w-6 h-6'}`}
            style={{ '--medal-mask': `url(${MEDALS[rank - 1]})` } as React.CSSProperties}
          >
            <img src={MEDALS[rank - 1]} alt={t('leaderboard.rankN', { rank })} className={`${rank <= 3 ? 'w-7 h-7' : 'w-6 h-6'} object-contain relative`} />
            <div
              className="medal-shine-overlay"
            />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-lg bg-zinc-700 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white">
            {rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-0.5">
            <span className="inline-flex items-baseline gap-1 shrink min-w-0">
              <span className="text-sm font-semibold text-white truncate">{displayName}</span>
              {!hidden && (
                <BadgeIcon badgeBalance={entry.badgeBalance || entry.total} username={entry.username} className="w-[1em] h-[1em]" />
              )}
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
        <span className="text-xs text-zinc-500 tabular-nums">
          {hidden ? t('leaderboard.hidden') : <>{formatLeaderboardNumber(entry.total)} <DhbCoin /></>}
        </span>
      </div>
    </Link>
  );
});

const SKELETON_CARDS = 4;

export const LeaderboardCarousel = memo(function LeaderboardCarousel() {
  const { t } = useTranslation();

  // Same key as the leaderboard page and the sidebar widget: whichever
  // surface fetched the all-time holdings row first feeds this one.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', 'holdings', 'all'],
    queryFn: () => getLeaderboard('holdings', 'all'),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: false,
  });

  const entries = applyLeaderboardRules(data?.result?.byWalletBalance, { sort: 'holdings', period: 'all' }).slice(0, 15);

  if (!isLoading && !isError && entries.length === 0) return null;

  return (
    <div className="bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/[0.08] rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" aria-hidden="true" />
          {t('nav.leaderboard')}
        </h3>
        <Link
          to="/app/leaderboard"
          className={cn('text-zinc-400 text-sm hover:text-white flex items-center gap-1 rounded', FOCUS_RING)}
        >
          {t('leaderboard.seeAll')} <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="relative">
        {isLoading ? (
          <div className="flex gap-2 overflow-hidden" role="status" aria-label={t('leaderboard.loadingBoard')}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <div key={i} className="flex-shrink-0 w-[160px] h-[84px] rounded-xl bg-white/[0.04] border border-white/[0.08] animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <AppState icon="trophy" title={t('leaderboard.failedToLoad')} size="compact" />
        ) : (
          <SwipeableCarousel fadeEdges className="flex gap-2 overflow-x-auto scrollbar-hide pr-8">
            {entries.map((entry) => (
              <LeaderboardCard
                key={entry.account}
                entry={entry}
                rank={entry.rank}
              />
            ))}
          </SwipeableCarousel>
        )}
      </div>
    </div>
  );
});

export default LeaderboardCarousel;
