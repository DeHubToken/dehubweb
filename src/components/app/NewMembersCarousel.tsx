import { useTranslation as _useCopy } from 'react-i18next';
/**
 * New Members Carousel
 * ====================
 * The roster row: members newest-joined first, scrolling sideways for as long
 * as there are members.
 *
 * Drawn exactly like the "Who to follow" row — the same FollowCoverCard, the
 * same section header, rail, gap and edge fades from styles/follow-cards.css —
 * because the two are the same gesture: faces you can follow without leaving
 * the page. Only the ordering differs, and the foot of each card says when the
 * person joined rather than a follower count they have not had time to earn.
 *
 * Renders nothing when the roster is empty. An empty state belongs in the rail,
 * where a tab has to explain itself once opened, and not here, where it would
 * be a permanent hole between two posts.
 *
 * @module components/app/NewMembersCarousel
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from "lucide-react";
import ChevronRight from "@/components/ui/cut-icons/next";

import { useQueryClient } from '@tanstack/react-query';
import { FollowCoverCard } from '@/components/app/FollowCoverCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { useFollowStatuses } from '@/hooks/use-follow-status';
import { isWithinNewWindow, joinedAgoLabel, useNewMembers, type NewMember } from '@/hooks/use-new-members';
import type { SuggestedAccount } from '@/lib/api/dehub';

interface NewMembersCarouselProps {
  /** Explore lists it among its sections: bigger title, no "See all" back to Explore. */
  surface?: 'feed' | 'explore';
}

/** The roster row in the shape the cover card draws. */
function toAccount(member: NewMember): SuggestedAccount {
  return {
    address: member.address,
    username: member.username ?? undefined,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    badgeBalance: member.badgeBalance,
    hideBadgeAndBalance: member.hideBadgeAndBalance,
  };
}

export function NewMembersCarousel({ surface = 'feed' }: NewMembersCarouselProps = {}) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { handleApiError } = useReauthHandler();
  const followOverrides = useFollowOverrides();
  const queryClient = useQueryClient();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNewMembers(walletAddress);

  const members = useMemo(
    () => (data?.pages.flatMap((page) => page.items) ?? []).filter((m) => !dismissed.has(m.address)),
    [data, dismissed],
  );
  const relationships = useFollowStatuses(members.map(member => member.address));

  const isFollowed = useCallback(
    (member: NewMember) => followOverrides.get(member.address.toLowerCase()) ?? relationships[member.address.toLowerCase()]?.isFollowing ?? false,
    [followOverrides, relationships],
  );
  const isRequested = useCallback(
    (member: NewMember) => followOverrides.get(member.address.toLowerCase()) === undefined && !!relationships[member.address.toLowerCase()]?.isFollowRequestPending,
    [followOverrides, relationships],
  );

  const byAddress = useMemo(() => new Map(members.map((m) => [m.address, m])), [members]);

  // Endless sideways: pull the next page as the far end comes into reach.
  const handleScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    if (scrollWidth - scrollLeft - clientWidth < 300) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  /**
   * Open by address, never by the username on the row: the roster is a
   * snapshot taken at registration, when most accounts still carry a generated
   * placeholder name the API does not know. The profile page canonicalises the
   * URL to the real username once it has loaded the account.
   */
  const openProfile = useCallback((user: SuggestedAccount) => {
    navigate(`/${user.address}`);
  }, [navigate]);

  const handleDismiss = useCallback((user: SuggestedAccount) => {
    setDismissed((prev) => new Set(prev).add(user.address));
  }, []);

  const handleFollow = useCallback((user: SuggestedAccount) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const member = byAddress.get(user.address);
    const rel = relationships[user.address.toLowerCase()];
    if (!member || isFollowed(member) || rel?.isFollowRequestPending || !rel) return;

    toggleFollowFor(queryClient, user.address, false, {
      name: member.displayName,
      onError: (err, info) => {
        if (!info.handled) handleApiError(err, 'Failed to follow user');
      },
    });
  }, [byAddress, handleApiError, isAuthenticated, isFollowed, openLoginModal, queryClient, relationships]);

  // No skeleton: the page has already laid itself out around this slot, and a
  // placeholder that resolves to nothing costs a reflow mid-scroll.
  if (isLoading || members.length === 0) return null;

  // "New members" while the newest of them actually is new; otherwise this is
  // simply the latest people to join.
  const title = isWithinNewWindow(members[0].joinedAt) ? _copy("copy.928d40b02992", { defaultValue: "New members" }) : _copy("copy.335e4a96e2dd", { defaultValue: "Latest members" });

  return (
    <section
      id={surface === 'explore' ? 'new-members' : undefined}
      data-new-members
      data-follow-cards
      data-follow-surface={surface}
      data-no-swipe
      className={surface === 'feed' ? 'py-4 border-b border-zinc-800/50' : 'py-1'}
    >
      <div data-fc-head>
        <h2 data-fc-title>{title}</h2>
        {surface === 'feed' && (
          <button type="button" data-fc-see-all onClick={() => navigate('/app/explore#new-members')}>
            {_copy("copy.44c9d36485b7", { defaultValue: "See All" })}<ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <SwipeableCarousel
        ref={carouselRef}
        fadeEdges
        className="fc-rail flex overflow-x-auto overscroll-x-contain scrollbar-hide px-4 pb-2 snap-x snap-mandatory scroll-px-4"
        onScroll={handleScroll}
      >
        {members.map((member) => {
          const requested = isRequested(member);
          return (
            <FollowCoverCard
              key={member.address}
              user={toAccount(member)}
              phase={isFollowed(member) || requested ? 'following' : undefined}
              followedLabel={requested ? _copy("copy.2d9e28289fac", { defaultValue: "Requested" }) : undefined}
              meta={_copy("copy.8d8ddae8f050", { defaultValue: "joined {{value1}}", value1: joinedAgoLabel(member.joinedAt) })}
              onOpen={openProfile}
              onFollow={handleFollow}
              onDismiss={handleDismiss}
            />
          );
        })}
        {isFetchingNextPage && (
          <div className="flex-shrink-0 w-16 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}
      </SwipeableCarousel>
    </section>
  );
}
