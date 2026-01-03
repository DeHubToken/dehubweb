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

import { ThumbsUp, ThumbsDown, MessageCircle, Share2, Bookmark, Repeat2, Quote, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ActionBarProps {
  /** Handler for like action */
  onLike?: () => void;
  /** Handler for dislike action */
  onDislike?: () => void;
  /** Handler for comment action */
  onComment?: () => void;
  /** Handler for share action */
  onShare?: () => void;
  /** Handler for repost action */
  onRepost?: () => void;
  /** Handler for quote action */
  onQuote?: () => void;
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
  onRepost,
  onQuote,
  onBookmark,
  className,
  showBorder = false 
}: ActionBarProps) {
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard');
  };

  const handleRepost = () => {
    onRepost?.();
    toast.success('Reposted!');
  };

  const handleQuote = () => {
    onQuote?.();
    toast.success('Quote created!');
  };

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
          
          {/* Share Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="text-white hover:text-zinc-400 transition-colors"
                aria-label="Share"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <DropdownMenuItem 
                onClick={handleRepost}
                className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
              >
                <Repeat2 className="w-4 h-4" />
                Repost
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleQuote}
                className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
              >
                <Quote className="w-4 h-4" />
                Quote
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleCopyLink}
                className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
              >
                <Link className="w-4 h-4" />
                Copy Link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
