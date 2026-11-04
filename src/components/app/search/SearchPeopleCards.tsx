import { useTranslation as _useCopy } from 'react-i18next';
/**
 * People results drawn as the follow-suggestion cards (banner, avatar, name,
 * handle, bio, followers, Follow), so a person found by search looks the same
 * as one suggested on Explore. The All tab shows them as a swipeable row; the
 * People tab wraps them into a grid.
 *
 * @module components/app/search/SearchPeopleCards
 */
import { useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FollowCoverCard } from '@/components/app/FollowCoverCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { useAuth } from '@/contexts/AuthContext';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import type { SearchCreator } from '@/hooks/use-dehub-search';
import type { SuggestedAccount } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';

export function toSuggestedAccount(user: SearchCreator): SuggestedAccount {
  const username = user.handle.replace(/^@/, '');
  return {
    address: user.id,
    username,
    displayName: user.name,
    avatarImageUrl: user.avatarPath,
    coverImageUrl: user.coverImageUrl ?? null,
    aboutMe: user.bio ?? null,
    followers: user.followerCount ?? 0,
    badgeBalance: user.badgeBalance,
    badgeLock: user.badgeLock ?? null,
    isFollowing: user.isFollowing,
    followsYou: user.followsYou,
  };
}

interface SearchPeopleCardsProps {
  users: SearchCreator[];
  layout: 'row' | 'grid';
  onProfileClick?: (handle: string) => void;
}

export const SearchPeopleCards = memo(function SearchPeopleCards({ users, layout, onProfileClick }: SearchPeopleCardsProps) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, isAuthenticated } = useAuth();
  const overrides = useFollowOverrides();
  const me = walletAddress?.toLowerCase();

  const open = useCallback((u: SuggestedAccount) => {
    const handle = u.username || u.address;
    onProfileClick?.(handle);
    navigate(`/${handle}`);
  }, [navigate, onProfileClick]);

  const follow = useCallback((u: SuggestedAccount) => {
    if (!isAuthenticated) {
      toast(_copy('copy.peoplesearch.signin', { defaultValue: 'Sign in to follow people' }));
      return;
    }
    void toggleFollowFor(queryClient, u.address, false, { name: u.displayName || u.username });
  }, [isAuthenticated, queryClient, _copy]);

  const cards = users
    .filter((u) => u.id && u.id.toLowerCase() !== me)
    .map((u) => {
      const account = toSuggestedAccount(u);
      const followed = overrides.get(account.address.toLowerCase()) ?? account.isFollowing;
      return (
        <FollowCoverCard
          key={account.address}
          user={account}
          phase={followed ? 'following' : undefined}
          onOpen={open}
          onFollow={follow}
        />
      );
    });

  return (
    <section data-follow-cards data-follow-surface="explore" data-search-people className="-mx-1">
      {layout === 'row' ? (
        <SwipeableCarousel
          fadeEdges
          className="fc-rail flex overflow-x-auto overscroll-x-contain scrollbar-hide px-1 pb-2 snap-x snap-mandatory scroll-px-1"
        >
          {cards}
        </SwipeableCarousel>
      ) : (
        <div className={cn('fc-rail flex flex-wrap px-1 pb-2')}>{cards}</div>
      )}
    </section>
  );
});
