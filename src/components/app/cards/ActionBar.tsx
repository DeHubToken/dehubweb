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
import { useIsTouchDevice } from '@/hooks/use-touch-device';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  showBorder = false 
}: ActionBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isTouchDevice = useIsTouchDevice();
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
        className="flex items-center gap-3 w-full p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <Repeat2 className="w-5 h-5" />
        <span>Repost</span>
      </button>
      <button
        onClick={handleQuote}
        className="flex items-center gap-3 w-full p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <Quote className="w-5 h-5" />
        <span>Quote</span>
      </button>
      <button
        onClick={handleCopyLink}
        className="flex items-center gap-3 w-full p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <Link className="w-5 h-5" />
        <span>Copy Link</span>
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
            onClick={onLike}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Like"
          >
            <ThumbsUp className="w-5 h-5" />
          </button>
          <button 
            onClick={onDislike}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Dislike"
          >
            <ThumbsDown className="w-5 h-5" />
          </button>
          <button 
            onClick={onComment}
            className="text-white hover:text-zinc-400 transition-colors"
            aria-label="Comment"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          
          {/* Share - Sheet for mobile, Dropdown for desktop */}
          {isTouchDevice ? (
            <>
              <button 
                onClick={() => setSheetOpen(true)}
                className="text-white hover:text-zinc-400 transition-colors"
                aria-label="Share"
              >
                <Share2 className="w-5 h-5" />
              </button>
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="bottom" className="bg-zinc-900/70 backdrop-blur-xl border-0 rounded-t-2xl">
                  <SheetHeader>
                    <SheetTitle className="text-white">Share</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-1 mt-4">
                    <ShareOptions />
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button 
                  className="text-white hover:text-zinc-400 transition-colors"
                  aria-label="Share"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px]">
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
          )}
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
