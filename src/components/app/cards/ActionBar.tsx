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

import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Repeat2, Quote, Link, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { voteOnNFT } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ActionBarProps {
  /** Post ID for info navigation and voting */
  postId?: string;
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
  /** Hide the dislike button (e.g., for images) */
  hideDislike?: boolean;
  /** Like count to display */
  likeCount?: number;
  /** Dislike count to display */
  dislikeCount?: number;
  /** Comment count to display */
  commentCount?: number;
}

/** Format count for display (e.g., 1500 -> 1.5K) */
function formatCount(count?: number): string {
  const value = count ?? 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toString();
}

export function ActionBar({ 
  postId,
  onComment, 
  onShare,
  onRepost,
  onQuote,
  onBookmark,
  className,
  showBorder = false,
  isLiked: initialIsLiked = false,
  isDisliked: initialIsDisliked = false,
  hideDislike = false,
  likeCount,
  dislikeCount,
  commentCount,
}: ActionBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [isDisliked, setIsDisliked] = useState(initialIsDisliked);
  const [isVoting, setIsVoting] = useState(false);
  const [justVoted, setJustVoted] = useState<'like' | 'dislike' | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const handleVote = useCallback(async (vote: boolean) => {
    if (!postId || isVoting || isLiked || isDisliked) return;
    
    if (!isAuthenticated) {
      toast.error('Please connect your wallet to vote');
      return;
    }

    setIsVoting(true);
    
    // Optimistic update with animation trigger
    if (vote) {
      setIsLiked(true);
      setJustVoted('like');
    } else {
      setIsDisliked(true);
      setJustVoted('dislike');
    }
    
    // Reset animation state after animation completes
    setTimeout(() => setJustVoted(null), 400);

    try {
      await voteOnNFT(postId, vote);
      // No toast on success - animation is enough feedback
    } catch (error: unknown) {
      // Revert optimistic update on error
      if (vote) {
        setIsLiked(false);
      } else {
        setIsDisliked(false);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('409') || errorMessage.includes('already')) {
        toast.error('You have already voted on this content');
        // Set the vote state since they already voted
        if (vote) {
          setIsLiked(true);
        } else {
          setIsDisliked(true);
        }
      } else {
        toast.error('Failed to vote. Please try again.');
      }
    } finally {
      setIsVoting(false);
    }
  }, [postId, isVoting, isLiked, isDisliked, isAuthenticated]);

  const hasVoted = isLiked || isDisliked;

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
          <motion.button 
            onClick={() => handleVote(true)}
            className={cn(
              "flex items-center gap-1 transition-colors text-white",
              hasVoted && !isLiked && "text-zinc-600 cursor-not-allowed",
              isVoting && "opacity-50"
            )}
            aria-label="Like"
            disabled={hasVoted || isVoting}
            animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <ThumbsUp className={cn("w-5 h-5", isLiked && "fill-current")} />
            <span className="text-xs text-zinc-400">{formatCount(likeCount)}</span>
          </motion.button>
          {!hideDislike && (
            <motion.button 
              onClick={() => handleVote(false)}
              className={cn(
                "flex items-center gap-1 transition-colors text-white",
                hasVoted && !isDisliked && "text-zinc-600 cursor-not-allowed",
                isVoting && "opacity-50"
              )}
              aria-label="Dislike"
              disabled={hasVoted || isVoting}
              animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <ThumbsDown className={cn("w-5 h-5", isDisliked && "fill-current")} />
              <span className="text-xs text-zinc-400">{formatCount(dislikeCount)}</span>
            </motion.button>
          )}
          <button 
            onClick={onComment}
            className="flex items-center gap-1 text-white hover:text-zinc-400 transition-colors"
            aria-label="Comment"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-xs text-zinc-400">{formatCount(commentCount)}</span>
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
