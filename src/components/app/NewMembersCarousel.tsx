/**
 * New Members Carousel
 * ====================
 * The feed's roster row: members newest-joined first, scrolling sideways for as
 * long as there are members, with the same card and the same Follow button as
 * the follow-suggestions carousel it sits in rotation with.
 *
 * Identical to that row on purpose — same w-[104px] card, same w-24 avatar,
 * same button — because the two are the same gesture: faces you can follow
 * without leaving the feed. Only the ordering differs, and the label says so.
 *
 * Renders nothing when the roster is empty. An empty state belongs in the rail,
 * where a tab has to explain itself once opened, and not here, where it would
 * be a permanent hole between two posts.
 *
 * @module components/app/NewMembersCarousel
 */

import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, Star } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getBadgeUrl } from '@/lib/staking-badges';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { isWithinNewWindow, joinedAgoLabel, useNewMembers, type NewMember } from '@/hooks/use-new-members';

interface NewMembersCarouselProps {
  /** Hide the "See all" link where it would point at the page you are on. */
  showSeeAll?: boolean;
  /** Off where the surface around it already says what this row is. */
  showHeader?: boolean;
  /** Replaces the feed's rules and padding — see NewMembersBento. */
  className?: string;
}

export function NewMembersCarousel({
  showSeeAll = true,
  showHeader = true,
  className,
}: NewMembersCarouselProps) {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { handleApiError } = useReauthHandler();
  const followOverrides = useFollowOverrides();
  const queryClient = useQueryClient();
  const carouselRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNewMembers(walletAddress);

  const members = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const isFollowed = useCallback(
    (member: NewMember) => followOverrides.get(member.address.toLowerCase()) === true,
    [followOverrides],
  );

  // Endless sideways: pull the next page as the far end comes into reach, the
  // horizontal twin of the rail's scroll handler.
  const handleScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    if (scrollWidth - scrollLeft - clientWidth < 300) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const openProfile = useCallback((member: NewMember) => {
    navigate(`/${member.username || member.address}`);
  }, [navigate]);

  const handleFollow = useCallback((e: React.MouseEvent, member: NewMember) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    if (isFollowed(member)) return;

    toggleFollowFor(queryClient, member.address, false, {
      name: member.displayName,
      onError: (err) => handleApiError(err, 'Failed to follow user'),
    });
  }, [handleApiError, isAuthenticated, isFollowed, openLoginModal, queryClient]);

  // No skeleton: the feed has already laid itself out around this slot, and a
  // placeholder that resolves to nothing costs a reflow mid-scroll.
  if (isLoading || members.length === 0) return null;

  // "New members" while the newest of them actually is new; otherwise this is
  // simply the latest people to join, and saying "new" would be a small lie
  // that ages badly.
  const title = isWithinNewWindow(members[0].joinedAt) ? 'New members' : 'Latest members';

  return (
    <div className={cn('py-4 border-y border-zinc-800/50', className)}>
      {showHeader && (
        <div className="flex items-center justify-between px-4 mb-3">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-white">{title}</span>
          </div>
          {showSeeAll && (
            <button
              onClick={() => navigate('/app/explore')}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              See All
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <SwipeableCarousel
        ref={carouselRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory"
        onScroll={handleScroll}
      >
        {members.map((member) => (
          <div
            key={member.address}
            onClick={() => openProfile(member)}
            className="flex-shrink-0 w-[104px] bg-zinc-900 rounded-xl p-1 cursor-pointer hover:bg-zinc-800/80 transition-colors snap-start"
          >
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-2">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                <AvatarFallback className="bg-zinc-700 text-white font-medium text-xl">
                  {member.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* pr-3 only when a badge actually draws — see BadgedName's gutter note. */}
              <span className={`relative inline-flex items-baseline shrink min-w-0 max-w-full${getBadgeUrl(member.badgeBalance, member.username) ? ' pr-3' : ''}`}>
                <span className="font-semibold text-white text-xs truncate">{member.displayName}</span>
                <BadgeIcon
                  badgeBalance={member.badgeBalance}
                  username={member.username}
                  className="w-[9px] h-[9px] absolute -top-0.5 right-0"
                />
              </span>
              <span className="text-[10px] text-zinc-500 mb-1.5 truncate max-w-full">
                joined {joinedAgoLabel(member.joinedAt)}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => handleFollow(e, member)}
                disabled={isFollowed(member)}
                className={`w-24 h-7 text-[10px] font-semibold rounded-lg border-zinc-700 bg-transparent flex items-center justify-center ${
                  isFollowed(member)
                    ? 'text-white/40 hover:bg-transparent cursor-default'
                    : 'text-white hover:bg-zinc-800'
                }`}
              >
                {isFollowed(member) ? 'Following' : 'Follow'}
              </Button>
            </div>
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="flex-shrink-0 w-[104px] flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}
      </SwipeableCarousel>
    </div>
  );
}
