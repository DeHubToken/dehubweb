/**
 * Sidebar — New Members
 * =====================
 * The fourth right-rail tab. Chrome only; the list, the wave and the
 * remembered-wave state all live in `NewMembersList`, which the Explore bento
 * shares so the two surfaces cannot drift.
 *
 * @module components/app/sidebar/SidebarNewMembers
 */

import { NewMembersList } from '@/components/app/NewMembersList';

export function SidebarNewMembers() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-white font-semibold text-sm">New members</h3>
        <p className="text-zinc-500 text-xs">Just joined — say hello</p>
      </div>
      <NewMembersList
        limit={30}
        listClassName="flex-1 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      />
    </div>
  );
}
