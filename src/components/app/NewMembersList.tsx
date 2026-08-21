/**
 * New Members List
 * ================
 * The roster as a vertical list — deliberately the same row, the same Follow
 * button and the same infinite scroll as `WhoToFollow`, which sits one tab
 * along. The only difference between the two panels is the ordering: this one
 * is newest joiner first, that one is whoever the API recommends.
 *
 * No header, no "just joined" strapline: the tab icon says what the panel is,
 * and anything extra makes it read as a different kind of thing than its
 * neighbour.
 *
 * A followed member stays on the list, unlike a used-up suggestion. This is
 * "who joined", not "who to follow", and somebody disappearing out of a
 * chronological order because you followed them would leave a hole in it.
 *
 * @module components/app/NewMembersList
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Star } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getBadgeUrl } from '@/lib/staking-badges';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { useNewMembers, type NewMember } from '@/hooks/use-new-members';

interface NewMembersListProps {
  /** Extra classes on the scrolling container — the only per-surface difference. */
  listClassName?: string;
}

export function NewMembersList({ listClassName }: NewMembersListProps) {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { handleApiError } = useReauthHandler();
  const followOverrides = useFollowOverrides();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNewMembers(walletAddress);

  const members = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const isFollowed = useCallback(
    (member: NewMember) => followOverrides.get(member.address.toLowerCase()) === true,
    [followOverrides],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 200) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <Star className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">
          {error ? 'Failed to load members' : 'No members to show yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent',
          listClassName,
        )}
      >
        {members.map((member) => (
          <div
            key={member.address}
            onClick={() => openProfile(member)}
            className="flex items-center gap-3 py-2 px-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
          >
            <div className="flex-shrink-0">
              <Avatar className="w-10 h-10">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                <AvatarFallback className="bg-zinc-700 text-white font-medium">
                  {member.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              {/* pr-3 only when a badge actually draws — see BadgedName's gutter note. */}
              <span className={`relative inline-flex items-baseline shrink min-w-0 max-w-full${getBadgeUrl(member.badgeBalance, member.username) ? ' pr-3' : ''}`}>
                <span className="font-semibold text-white text-sm truncate">{member.displayName}</span>
                <BadgeIcon
                  badgeBalance={member.badgeBalance}
                  username={member.username}
                  className="w-[9px] h-[9px] absolute -top-0.5 right-0"
                />
              </span>
            </div>
            <button
              onClick={(e) => handleFollow(e, member)}
              disabled={isFollowed(member)}
              data-follow-btn
              className={`h-6 min-w-0 w-auto px-2.5 text-[11px] font-semibold rounded-lg flex items-center justify-center transition-all duration-150 flex-shrink-0 ${
                isFollowed(member)
                  ? 'bg-white/10 text-white/40 cursor-default'
                  : 'bg-gradient-to-br from-white/15 via-white/8 to-white/4 backdrop-blur-xl border border-white/20 text-white/70 hover:from-white/25 hover:via-white/15 hover:to-white/10 hover:border-white/40 hover:text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]'
              }`}
            >
              {isFollowed(member) ? 'Following' : 'Follow'}
            </button>
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
