/**
 * Action Bar Component
 * ====================
 * Universal action bar for all feed card types.
 * Provides consistent interaction buttons: like, dislike, comment, share, bookmark.
 * 
 * @example
 * ```tsx
 * <ActionBar 
 *   onLike={() => handleLike()}
 *   onComment={() => openComments()}
 * />
 * ```
 */

import { ThumbsUp, ThumbsDown, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionBarProps {
  /** Handler for like action */
  onLike?: () => void;
  /** Handler for dislike action */
  onDislike?: () => void;
  /** Handler for comment action */
  onComment?: () => void;
  /** Handler for share action */
  onShare?: () => void;
  /** Handler for bookmark action */
  onBookmark?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show border on top */
  showBorder?: boolean;
}

export function ActionBar({ 
  onLike, 
  onDislike, 
  onComment, 
  onShare, 
  onBookmark,
  className,
  showBorder = false 
}: ActionBarProps) {
  return (
    <div className={cn(
      "p-3",
      showBorder && "border-t border-zinc-800",
      className
    )}>
      <div className="flex items-center justify-between">
        {/* Primary actions */}
        <div className="flex items-center gap-4">
          <button 
            onClick={onLike}
            className="text-white hover:text-green-400 transition-colors"
            aria-label="Like"
          >
            <ThumbsUp className="w-5 h-5" />
          </button>
          <button 
            onClick={onDislike}
            className="text-white hover:text-red-400 transition-colors"
            aria-label="Dislike"
          >
            <ThumbsDown className="w-5 h-5" />
          </button>
          <button 
            onClick={onComment}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Comment"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={onShare}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Share"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        {/* Bookmark action */}
        <button 
          onClick={onBookmark}
          className="text-white hover:text-zinc-400 transition-colors"
          aria-label="Bookmark"
        >
          <Bookmark className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
