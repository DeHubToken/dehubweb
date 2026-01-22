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

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Repeat2, Quote, Link, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ActionBarProps {
  /** Post ID for info navigation */
  postId?: string;
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
  /** Whether the current user has liked this item */
  isLiked?: boolean;
  /** Whether the current user has disliked this item */
  isDisliked?: boolean;
}

export function ActionBar({ 
  postId,
  onLike, 
  onDislike, 
  onComment, 
  onShare,
  onRepost,
  onQuote,
  onBookmark,
  className,
  showBorder = false,
  isLiked = false,
  isDisliked = false,
}: ActionBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();

  const handleInfoClick = () => {
    if (postId) {
      navigate(`/app/post/${postId}/info`);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard');
    setSheetOpen(false);
  };

  const handleRepost = () => {
    onRepost?.();
    toast.success('Reposted!');
    setSheetOpen(false);
  };

  const handleQuote = () => {
    onQuote?.();
    toast.success('Quote created!');
    setSheetOpen(false);
  };

  const ShareOptions = () => (
    <>
      <button
        onClick={handleRepost}
        className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
      >
        <Repeat2 className="w-5 h-5" />
        <span className="font-medium">Repost</span>
      </button>
      <button
        onClick={handleQuote}
        className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
      >
        <Quote className="w-5 h-5" />
        <span className="font-medium">Quote</span>
      </button>
      <button
        onClick={handleCopyLink}
        className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
      >
        <Link className="w-5 h-5" />
        <span className="font-medium">Copy Link</span>
      </button>
    </>
  );

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
            onClick={!isLiked && !isDisliked ? onLike : undefined}
            className={cn(
              "transition-colors",
              isLiked 
                ? "text-primary cursor-default" 
                : isDisliked 
                  ? "text-zinc-600 cursor-not-allowed" 
                  : "text-white hover:text-zinc-400"
            )}
            aria-label="Like"
            disabled={isLiked || isDisliked}
          >
            <ThumbsUp className={cn("w-5 h-5", isLiked && "fill-current")} />
          </button>
          <button 
            onClick={!isLiked && !isDisliked ? onDislike : undefined}
            className={cn(
              "transition-colors",
              isDisliked 
                ? "text-destructive cursor-default" 
                : isLiked 
                  ? "text-zinc-600 cursor-not-allowed" 
                  : "text-white hover:text-zinc-400"
            )}
            aria-label="Dislike"
            disabled={isLiked || isDisliked}
          >
            <ThumbsDown className={cn("w-5 h-5", isDisliked && "fill-current")} />
          </button>
          <button 
            onClick={onComment}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Comment"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          
          {/* Share - Bottom sheet for all devices with liquid glass effect */}
          <button 
            onClick={() => setSheetOpen(true)}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Share"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent 
              side="bottom" 
              className="bg-white/10 backdrop-blur-2xl border-0 border-t border-white/20 rounded-t-3xl shadow-[0_-10px_60px_-15px_rgba(255,255,255,0.1)]"
            >
              <div className="absolute inset-0 rounded-t-3xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
              <SheetHeader className="relative">
                <SheetTitle className="text-white/90 font-semibold">Share</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 mt-4 relative">
                <ShareOptions />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onBookmark}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Bookmark"
          >
            <Bookmark className="w-5 h-5" />
          </button>
          <button 
            onClick={handleInfoClick}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Post info"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
