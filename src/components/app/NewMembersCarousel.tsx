/**
 * New Members Carousel
 * ====================
 * The feed's new-members surface: a side-scrolling row of people who joined in
 * the last NEW_MEMBER_WINDOW_DAYS, sitting in the same rotation as the radio,
 * livestream, follow-suggestion and leaderboard carousels.
 *
 * A carousel rather than the rail's vertical list because the feed's other
 * inserts are all carousels — a stacked list dropped between two of them reads
 * as a page section that lost its page. The card matches the follow-suggestion
 * card's geometry (w-[104px], w-24 avatar) for the same reason: two rows of
 * faces the same size, scrolling the same way.
 *
 * Renders nothing when nobody is new. An empty state is right in the rail,
 * where a tab has to explain what it is once opened, and wrong here, where it
 * would be a permanent hole between two posts.
 *
 * @module components/app/NewMembersCarousel
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { getBadgeUrl } from '@/lib/staking-badges';
import { cn } from '@/lib/utils';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { useAuth } from '@/contexts/AuthContext';
import { joinedAgoLabel, useNewMembers, type NewMember } from '@/hooks/use-new-members';

/** Shared with NewMembersList so a wave remembered there is remembered here. */
const WAVED_KEY = 'dehub_waved_at';

/** The greeting a wave drafts. Short on purpose — it is meant to be edited, not sent as-is. */
const WELCOME_MESSAGE = 'Welcome to DeHub! 👋 Give me a shout if you need anything.';

function readWaved(): Set<string> {
  try {
    const raw = localStorage.getItem(WAVED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function rememberWave(address: string, current: Set<string>): Set<string> {
  const next = new Set(current);
  next.add(address.toLowerCase());
  try {
    localStorage.setItem(WAVED_KEY, JSON.stringify([...next]));
  } catch {
    // Private-mode storage failure only costs the label, not the wave.
  }
  return next;
}

interface NewMembersCarouselProps {
  limit?: number;
  /** Hide the "See all" link where it would point at the page you are on. */
  showSeeAll?: boolean;
  /** Off where the surface around it already says what this row is. */
  showHeader?: boolean;
  /** Replaces the feed's rules and padding — see NewMembersBento. */
  className?: string;
}

export function NewMembersCarousel({
  limit = 20,
  showSeeAll = true,
  showHeader = true,
  className,
}: NewMembersCarouselProps) {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { data: members = [], isLoading } = useNewMembers(limit, walletAddress);
  const [waved, setWaved] = useState<Set<string>>(readWaved);

  const openProfile = useCallback((member: NewMember) => {
    navigate(`/${member.username || member.address}`);
  }, [navigate]);

  const handleWave = useCallback((e: React.MouseEvent, member: NewMember) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    setWaved((prev) => rememberWave(member.address, prev));
    navigate('/app/messages', {
      state: {
        openDmWith: member.address,
        username: member.username || undefined,
        draftBody: WELCOME_MESSAGE,
      },
    });
  }, [isAuthenticated, navigate, openLoginModal]);

  // No skeleton: the feed has already laid itself out around this slot, and a
  // placeholder that resolves to nothing costs a reflow mid-scroll.
  if (isLoading || members.length === 0) return null;

  return (
    <div className={cn('py-4 border-y border-zinc-800/50', className)}>
      {/* Header — same shape as the follow-suggestions carousel above it. */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-white">New members</span>
            <span className="hidden sm:inline text-xs text-zinc-500">Just joined — say hello</span>
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

      <SwipeableCarousel className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory">
        {members.map((member) => {
          const hasWaved = waved.has(member.address.toLowerCase());
          return (
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
                  onClick={(e) => handleWave(e, member)}
                  className={`w-24 h-7 text-[10px] font-semibold rounded-lg border-zinc-700 bg-transparent flex items-center justify-center ${
                    hasWaved ? 'text-white/40 hover:bg-transparent' : 'text-white hover:bg-zinc-800'
                  }`}
                >
                  {hasWaved ? 'Waved' : 'Wave 👋'}
                </Button>
              </div>
            </div>
          );
        })}
      </SwipeableCarousel>
    </div>
  );
}
