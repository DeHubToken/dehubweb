/**
 * Sidebar — New Members
 * =====================
 * The fourth right-rail tab. Chrome only, and deliberately none of it: the
 * follow-suggestions tab beside it has no header either, and the whole point of
 * this panel is that it is that panel ordered by arrival instead of by
 * recommendation.
 *
 * @module components/app/sidebar/SidebarNewMembers
 */

import { NewMembersList } from '@/components/app/NewMembersList';

export function SidebarNewMembers() {
  return <NewMembersList />;
}
