/**
 * New Members Bento
 * =================
 * The new-members surface for everything that is not a desktop browser.
 *
 * The right rail is `hidden lg:block`, so on a phone or a narrow window the
 * only trace of this feature would otherwise be a chip on a profile you had
 * already found — and the request that asked for it said "all devices". Explore
 * is where the same list belongs: the page people already open to find other
 * people, and the web twin of mobile's Search screen, which carries the same
 * rail in the same slot.
 *
 * `lg:hidden` because the rail already covers desktop, and two copies of the
 * same list on one screen reads as a bug.
 *
 * @module components/app/NewMembersBento
 */

import { Sparkles } from 'lucide-react';
import { NewMembersList } from '@/components/app/NewMembersList';
import { useNewMembers } from '@/hooks/use-new-members';
import { useAuth } from '@/contexts/AuthContext';

export function NewMembersBento() {
  const { walletAddress } = useAuth();
  const { data: members = [], isLoading } = useNewMembers(10, walletAddress);

  // Nothing to welcome and nothing to say about it — an empty bento here is
  // just a hole in the page, unlike the rail where the tab has to explain
  // itself once opened.
  if (isLoading || members.length === 0) return null;

  return (
    <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 lg:hidden">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-zinc-400" />
        <h2 className="text-lg sm:text-xl font-bold text-white">New members</h2>
      </div>
      <p className="text-zinc-500 text-sm -mt-3 mb-3">Just joined — say hello</p>
      <NewMembersList limit={10} listClassName="-mx-4 sm:-mx-2" />
    </div>
  );
}
