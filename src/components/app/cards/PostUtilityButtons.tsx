/**
 * Post Utility Buttons
 * ====================
 * The non-engagement actions for a post: bookmark, pin (own posts only), info.
 *
 * Two render variants:
 *  - `inline` — the small zinc icon buttons used inside the bottom ActionBar
 *    (unchanged from the original ActionBar layout).
 *  - `chip`   — glass pill buttons matching the fullscreen viewer's top-right
 *    controls (Close / Translate). Used on desktop to lift these actions up to
 *    the top-right corner for easy reach.
 *
 * Bookmark and pin state are owned here (via the shared hooks), so an inline
 * instance and a chip instance are never mounted for the same post at the same
 * time — the caller shows one per breakpoint.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Pin, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin } from '@/hooks/use-pins';

interface PostUtilityButtonsProps {
  postId?: string;
  tokenId?: number;
  /** Show the pin button (own posts only). */
  isOwnPost?: boolean;
  variant?: 'inline' | 'chip';
}

/** Glass pill matching FullscreenImageViewer's top-right controls. */
const CHIP_BASE =
  'w-10 h-10 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors';

export function PostUtilityButtons({
  postId,
  tokenId,
  isOwnPost = false,
  variant = 'inline',
}: PostUtilityButtonsProps) {
  const navigate = useNavigate();
  const isChip = variant === 'chip';
  const [isPinned, setIsPinned] = useState(false);
  const togglePinMutation = useTogglePin();
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(postId || '');

  // Chip buttons live outside the ActionBar's stop-propagation wrapper (e.g.
  // over the fullscreen viewer's close-on-click backdrop), so they must stop
  // clicks themselves. Inline buttons preserve the ActionBar's original bubbling.
  const stopIfChip = (e: React.MouseEvent) => {
    if (isChip) e.stopPropagation();
  };

  const handleInfoClick = (e: React.MouseEvent) => {
    stopIfChip(e);
    if (postId) navigate(`/app/post/${postId}/info`);
  };

  const iconSize = 'w-5 h-5';

  return (
    <>
      <motion.button
        onClick={(e) => {
          stopIfChip(e);
          toggleBookmark();
        }}
        className={cn(
          isChip
            ? cn(CHIP_BASE, isBookmarked && 'text-yellow-500 hover:text-yellow-400')
            : cn('transition-colors', isBookmarked ? 'text-yellow-500' : 'text-zinc-400 hover:text-white'),
          isBookmarkLoading && 'opacity-50',
        )}
        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
        disabled={isBookmarkLoading}
        animate={isBookmarked ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Bookmark className={cn(iconSize, isBookmarked && 'fill-current')} />
      </motion.button>

      {isOwnPost && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!tokenId || togglePinMutation.isPending) return;
            togglePinMutation.mutate(tokenId, {
              onSuccess: (data) => setIsPinned(data.pinned),
            });
          }}
          disabled={!tokenId || togglePinMutation.isPending}
          aria-label={isPinned ? 'Unpin post' : 'Pin post'}
          className={cn(
            isChip
              ? cn(CHIP_BASE, isPinned && 'text-blue-400', 'disabled:opacity-40')
              : cn('transition-colors disabled:opacity-40', isPinned ? 'text-blue-400' : 'text-zinc-400 hover:text-white'),
          )}
        >
          <Pin className={cn(iconSize, isPinned && 'fill-current')} />
        </button>
      )}

      <button
        onClick={handleInfoClick}
        className={cn(isChip ? CHIP_BASE : 'text-zinc-400 hover:text-white transition-colors')}
        aria-label="Post info"
      >
        <Info className={iconSize} />
      </button>
    </>
  );
}
