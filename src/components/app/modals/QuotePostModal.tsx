/**
 * Quote Post Modal
 * =================
 * Quoting is posting: this opens the standard composer with the quoted post
 * attached, so a quote gets the same media, poll, rating and mint choices as
 * any other post — and, like any other post, publishes off-chain without a
 * wallet unless "Mint post" is on.
 *
 * Kept as its own component (and lazily loaded through QuotePostModalLazy) so
 * feed cards keep their existing `open` / `onOpenChange` / `quotedPost` API.
 */

import { PostModal } from '@/features/post';
import type { DeHubNFT } from '@/lib/api/dehub/types';

interface QuotePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The post being quoted */
  quotedPost: DeHubNFT;
}

export function QuotePostModal({ open, onOpenChange, quotedPost }: QuotePostModalProps) {
  return (
    <PostModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      quotedPost={quotedPost}
    />
  );
}
