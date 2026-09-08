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
 * Bookmark and pin state both come from shared queries, so this component, a
 * second instance of it, and the same post's `PostUtilityMenuItems` rows in the
 * three-dot menu always show the same thing — they are on screen together now
 * that the menu rows are no longer hidden on desktop.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Pin, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin, useIsPostPinned } from '@/hooks/use-pins';
import { SaveToFolderDrawer } from '@/components/app/bookmarks/SaveToFolderDrawer';

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
  const { t } = useTranslation();
  const isChip = variant === 'chip';
  // Shared with the three-dot menu's pin row for the same post — see
  // `usePinnedPostIds`. A local boolean here would start at "not pinned" on
  // every mount and contradict whichever control the user last used.
  const isPinned = useIsPostPinned(tokenId);
  const togglePinMutation = useTogglePin();
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(postId || '');
  const [showFolderDrawer, setShowFolderDrawer] = useState(false);

  // The folder picker needs a numeric token id. `tokenId` is the reliable
  // source; postId is a string id that happens to be numeric on post cards.
  const folderTokenId = tokenId ?? (postId && /^\d+$/.test(postId) ? Number(postId) : null);

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
          // Offer the folder picker only on save, and only when we have a token
          // id to file — un-bookmarking just removes it.
          toggleBookmark(folderTokenId != null ? () => setShowFolderDrawer(true) : undefined);
        }}
        className={cn(
          isChip
            ? cn(CHIP_BASE, isBookmarked && 'text-yellow-500 hover:text-yellow-400')
            : cn('transition-colors', isBookmarked ? 'text-yellow-500' : 'text-zinc-400 hover:text-white'),
          isBookmarkLoading && 'opacity-50',
        )}
        aria-label={isBookmarked ? t('postOptions.removeBookmark', 'Remove bookmark') : t('postOptions.bookmark', 'Bookmark')}
        data-engaged={isBookmarked ? 'bookmark' : undefined}
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
            togglePinMutation.mutate(tokenId);
          }}
          disabled={!tokenId || togglePinMutation.isPending}
          aria-label={isPinned ? t('postOptions.unpinPost', 'Unpin from your profile') : t('postOptions.pinPost', 'Pin to your profile')}
          data-engaged={isPinned ? 'pin' : undefined}
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
        aria-label={t('postInfo.title', 'Post info')}
      >
        <Info className={iconSize} />
      </button>

      <SaveToFolderDrawer
        open={showFolderDrawer}
        onOpenChange={setShowFolderDrawer}
        tokenId={folderTokenId}
      />
    </>
  );
}
