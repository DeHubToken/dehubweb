/**
 * New Members Bento
 * =================
 * Explore's roster slot, at the bottom of the page under Trending. It is the
 * same row the feed carries, drawn exactly like the "Who to follow" row above
 * it on this page: no bento wrapper, no rules above and below, cards inset
 * from the edge and fading out at the sides rather than stopping flush.
 *
 * Renders nothing when the roster is empty.
 *
 * @module components/app/NewMembersBento
 */

import { NewMembersCarousel } from '@/components/app/NewMembersCarousel';

export function NewMembersBento() {
  return <NewMembersCarousel surface="explore" />;
}
