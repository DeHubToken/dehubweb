/**
 * The Save tile of the phone post page's action bar: the bookmark, with the
 * same shared query and folder picker the bookmark icon and the options menu
 * use, so all three always agree.
 */
import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { SaveToFolderDrawerLazy } from '@/components/app/bookmarks/SaveToFolderDrawerLazy';

interface StageSaveTileProps {
  postId?: string;
  tokenId?: number;
  className?: string;
}

export function StageSaveTile({ postId, tokenId, className }: StageSaveTileProps) {
  const { t } = useTranslation();
  const { isBookmarked, isLoading, toggleBookmark } = useBookmarkPost(postId || '');
  const [showFolderDrawer, setShowFolderDrawer] = useState(false);
  const folderTokenId = tokenId ?? (postId && /^\d+$/.test(postId) ? Number(postId) : null);

  return (
    <>
      <button
        type="button"
        data-stage-tile
        data-stage-action="save"
        data-engaged={isBookmarked ? 'bookmark' : undefined}
        disabled={isLoading}
        onClick={(e) => {
          e.stopPropagation();
          toggleBookmark(folderTokenId != null ? () => setShowFolderDrawer(true) : undefined);
        }}
        aria-label={isBookmarked ? t('postOptions.removeBookmark', 'Remove bookmark') : t('postOptions.bookmark', 'Bookmark')}
        className={cn(className, isLoading && 'opacity-60')}
      >
        <Bookmark className={cn('h-5 w-5', isBookmarked && 'fill-current')} />
        <span>{isBookmarked ? t('postStage.saved', 'Saved') : t('postStage.save', 'Save')}</span>
      </button>
      <SaveToFolderDrawerLazy open={showFolderDrawer} onOpenChange={setShowFolderDrawer} tokenId={folderTokenId} />
    </>
  );
}
