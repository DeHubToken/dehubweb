/**
 * Post Utility Menu Items
 * =======================
 * Bookmark, pin (own posts) and post info as three-dot-menu rows.
 *
 * The same three actions render as icon buttons in the card's action bar via
 * `PostUtilityButtons`. That cluster is desktop-only, and these rows used to be
 * `lg:hidden` in every card's options drawer, so each action existed at exactly
 * one breakpoint and neither surface was ever the reliable place to look for
 * it. Both are shown at every breakpoint now, and this component is what stops
 * the six copies of the drawer rows drifting apart.
 *
 * State comes from the shared hooks (`useBookmarkPost`, `usePinnedPostIds`),
 * so a row and the icon button for the same post always agree.
 */

import { Bookmark, Pin, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin, useIsPostPinned } from '@/hooks/use-pins';

interface PostUtilityMenuItemsProps {
  postId?: string;
  tokenId?: number;
  /** Show the pin row (own posts only). */
  isOwnPost?: boolean;
  /**
   * Fired before navigating away to the post info page. Hosts that sit in
   * their own layer — the shorts viewer, the feed's post overlay — use it to
   * close themselves so the info page is not left underneath one.
   */
  onBeforeNavigate?: () => void;
}

const ROW =
  'flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left';

export function PostUtilityMenuItems({
  postId,
  tokenId,
  isOwnPost = false,
  onBeforeNavigate,
}: PostUtilityMenuItemsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(postId || '');
  const togglePinMutation = useTogglePin();
  const isPinned = useIsPostPinned(tokenId);

  return (
    <>
      <button
        onClick={() => toggleBookmark()}
        disabled={isBookmarkLoading}
        className={cn(ROW, 'disabled:opacity-50', isBookmarked ? 'text-yellow-500' : 'text-white')}
      >
        <Bookmark className={cn('w-5 h-5', isBookmarked && 'fill-current')} />
        {isBookmarked
          ? t('postOptions.removeBookmark', 'Remove bookmark')
          : t('postOptions.bookmark', 'Bookmark')}
      </button>

      {isOwnPost && (
        <button
          onClick={() => {
            if (!tokenId || togglePinMutation.isPending) return;
            togglePinMutation.mutate(tokenId);
          }}
          disabled={!tokenId || togglePinMutation.isPending}
          className={cn(ROW, 'disabled:opacity-40', isPinned ? 'text-blue-400' : 'text-white')}
        >
          <Pin className={cn('w-5 h-5', isPinned && 'fill-current')} />
          {isPinned ? t('postOptions.unpinPost', 'Unpin from your profile') : t('postOptions.pinPost', 'Pin to your profile')}
        </button>
      )}

      <button
        onClick={() => {
          onBeforeNavigate?.();
          if (postId) navigate(`/app/post/${postId}/info`);
        }}
        className={cn(ROW, 'text-white')}
      >
        <Info className="w-5 h-5" /> {t('postInfo.title', 'Post info')}
      </button>
    </>
  );
}
