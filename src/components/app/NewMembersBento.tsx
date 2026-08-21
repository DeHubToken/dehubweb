/**
 * New Members Bento
 * =================
 * Explore's roster slot: the same carousel the feed carries, in the bento
 * chrome the rest of that page uses, at the bottom of the page under Trending.
 *
 * Every width, not `lg:hidden` as this started out. The desktop right rail does
 * carry the same roster, but behind the fourth tab of a panel that opens on
 * Leaderboard — so on desktop this is not a second copy of something already on
 * screen, it is the only copy on screen. Explore is also the page people open
 * to find other people, which is where "who just joined" belongs.
 *
 * Renders nothing when the roster is empty: an empty bento is just a hole in
 * the page, unlike the rail where the tab has to explain itself once opened.
 *
 * @module components/app/NewMembersBento
 */

import { Star } from 'lucide-react';
import { NewMembersCarousel } from '@/components/app/NewMembersCarousel';
import { isWithinNewWindow, useNewMembers } from '@/hooks/use-new-members';
import { useAuth } from '@/contexts/AuthContext';

export function NewMembersBento() {
  const { walletAddress } = useAuth();
  const { data, isLoading } = useNewMembers(walletAddress);

  const first = data?.pages[0]?.items[0];
  if (isLoading || !first) return null;

  return (
    <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Star className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg sm:text-xl font-bold text-white">
          {isWithinNewWindow(first.joinedAt) ? 'New members' : 'Latest members'}
        </h2>
      </div>
      {/* The bento already says what this is, so the carousel's own header and
          its feed rules come off; the negative margin lets the row bleed to the
          bento's edge and scroll out of it rather than stopping short. */}
      <NewMembersCarousel showHeader={false} className="py-0 border-0 -mx-4 sm:-mx-6" />
    </div>
  );
}
