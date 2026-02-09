/**
 * Action Bar Component
 * ====================
 * Universal action bar for all feed card types.
 * Provides consistent interaction buttons: like, dislike, comment, share, bookmark.
 * 
 * @example
 * ```tsx
 * <ActionBar 
 *   postId="123"
 *   onComment={() => openComments()}
 * />
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Repeat2, Quote, Link, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { voteOnPost } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { getVoteCache, setVoteCache } from '@/lib/vote-cache';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

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
  /** Share count to display */
  shareCount?: number;
  /** Whether this is an optimistic (processing) post */
  isOptimistic?: boolean;
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
  className,
  showBorder = false,
  isLiked: initialIsLiked = false,
  isDisliked: initialIsDisliked = false,
  hideDislike = false,
  likeCount,
  dislikeCount,
  commentCount,
  shareCount,
  isOptimistic = false,
}: ActionBarProps) {
  // On mount, check global vote cache for recent votes on this post
  const cachedVote = postId ? getVoteCache(postId) : null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(cachedVote ? cachedVote.isLiked : initialIsLiked);
  const [isDisliked, setIsDisliked] = useState(cachedVote ? cachedVote.isDisliked : initialIsDisliked);
  const [localLikeCount, setLocalLikeCount] = useState(cachedVote ? cachedVote.likeCount : (likeCount ?? 0));
  const [localDislikeCount, setLocalDislikeCount] = useState(cachedVote ? cachedVote.dislikeCount : (dislikeCount ?? 0));
  const [isVoting, setIsVoting] = useState(false);
  const [justVoted, setJustVoted] = useState<'like' | 'dislike' | null>(null);
  // Track when user voted locally so we don't let stale API refetches overwrite optimistic state
  const lastVoteTimeRef = useRef(cachedVote ? Date.now() : 0);
  const VOTE_GUARD_MS = 10000; // ignore prop syncs for 10s after a local vote

  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  // Sync local state with props when they change, but skip if user recently voted (or cache active)
  useEffect(() => {
    if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
    if (postId && getVoteCache(postId)) return;
    setIsLiked(initialIsLiked);
  }, [initialIsLiked]);

  useEffect(() => {
    if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
    if (postId && getVoteCache(postId)) return;
    setIsDisliked(initialIsDisliked);
  }, [initialIsDisliked]);

  useEffect(() => {
    if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
    if (postId && getVoteCache(postId)) return;
    setLocalLikeCount(likeCount ?? 0);
  }, [likeCount]);

  useEffect(() => {
    if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
    if (postId && getVoteCache(postId)) return;
    setLocalDislikeCount(dislikeCount ?? 0);
  }, [dislikeCount]);
  
  // Bookmark state from hook
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(postId || '');
  
  const handleVote = useCallback(async (vote: boolean) => {
    if (!postId || isVoting) return;
    
    if (!isAuthenticated) {
      toast.error('Log in to engage');
      return;
    }

    // If clicking the same vote again, it's a toggle (remove vote)
    const isRemovingVote = (vote && isLiked) || (!vote && isDisliked);
    // If switching from one vote to another
    const isSwitchingVote = (vote && isDisliked) || (!vote && isLiked);

    setIsVoting(true);
    lastVoteTimeRef.current = Date.now();
    // Optimistic update with animation trigger
    if (isRemovingVote) {
      // Removing current vote
      if (vote) {
        setIsLiked(false);
        setLocalLikeCount(prev => Math.max(0, prev - 1));
      } else {
        setIsDisliked(false);
        setLocalDislikeCount(prev => Math.max(0, prev - 1));
      }
    } else if (isSwitchingVote) {
      // Switching vote
      if (vote) {
        setIsLiked(true);
        setIsDisliked(false);
        setLocalLikeCount(prev => prev + 1);
        setLocalDislikeCount(prev => Math.max(0, prev - 1));
        setJustVoted('like');
      } else {
        setIsDisliked(true);
        setIsLiked(false);
        setLocalDislikeCount(prev => prev + 1);
        setLocalLikeCount(prev => Math.max(0, prev - 1));
        setJustVoted('dislike');
      }
    } else {
      // New vote
      if (vote) {
        setIsLiked(true);
        setLocalLikeCount(prev => prev + 1);
        setJustVoted('like');
      } else {
        setIsDisliked(true);
        setLocalDislikeCount(prev => prev + 1);
        setJustVoted('dislike');
      }
    }
    
    // Reset animation state after animation completes
    setTimeout(() => setJustVoted(null), 400);

    // We need to write to the global vote cache after state settles.
    // Use a microtask so the functional setState calls above have resolved.
    queueMicrotask(() => {
      // Compute new values inline (mirrors the optimistic logic above)
      let newLiked = isLiked, newDisliked = isDisliked;
      let newLikeCount = localLikeCount, newDislikeCount = localDislikeCount;
      if (isRemovingVote) {
        if (vote) { newLiked = false; newLikeCount = Math.max(0, newLikeCount - 1); }
        else { newDisliked = false; newDislikeCount = Math.max(0, newDislikeCount - 1); }
      } else if (isSwitchingVote) {
        if (vote) { newLiked = true; newDisliked = false; newLikeCount++; newDislikeCount = Math.max(0, newDislikeCount - 1); }
        else { newDisliked = true; newLiked = false; newDislikeCount++; newLikeCount = Math.max(0, newLikeCount - 1); }
      } else {
        if (vote) { newLiked = true; newLikeCount++; }
        else { newDisliked = true; newDislikeCount++; }
      }
      setVoteCache(postId, { isLiked: newLiked, isDisliked: newDisliked, likeCount: newLikeCount, dislikeCount: newDislikeCount });
    });

    try {
      await voteOnPost({ tokenId: parseInt(postId, 10), voteType: vote ? 'for' : 'against' });
      // No toast on success - animation is enough feedback
    } catch (error: unknown) {
      // Revert optimistic update on error
      if (isRemovingVote) {
        if (vote) {
          setIsLiked(true);
          setLocalLikeCount(prev => prev + 1);
        } else {
          setIsDisliked(true);
          setLocalDislikeCount(prev => prev + 1);
        }
      } else if (isSwitchingVote) {
        if (vote) {
          setIsLiked(false);
          setIsDisliked(true);
          setLocalLikeCount(prev => Math.max(0, prev - 1));
          setLocalDislikeCount(prev => prev + 1);
        } else {
          setIsDisliked(false);
          setIsLiked(true);
          setLocalDislikeCount(prev => Math.max(0, prev - 1));
          setLocalLikeCount(prev => prev + 1);
        }
      } else {
        if (vote) {
          setIsLiked(false);
          setLocalLikeCount(prev => Math.max(0, prev - 1));
        } else {
          setIsDisliked(false);
          setLocalDislikeCount(prev => Math.max(0, prev - 1));
        }
      }
      
      toast.error('Failed to vote. Please try again.');
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
    const url = postId 
      ? `${window.location.origin}/app/post/${postId}`
      : window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Post URL copied to clipboard');
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
              isVoting && "opacity-50"
            )}
            aria-label="Like"
            disabled={isVoting}
            animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <ThumbsUp className={cn("w-5 h-5", isLiked && "fill-current")} />
            <span className="text-xs text-zinc-400">{formatCount(localLikeCount)}</span>
          </motion.button>
          {!hideDislike && (
            <motion.button 
              onClick={() => handleVote(false)}
              className={cn(
                "flex items-center gap-1 transition-colors text-white",
                isVoting && "opacity-50"
              )}
              aria-label="Dislike"
              disabled={isVoting}
              animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <ThumbsDown className={cn("w-5 h-5", isDisliked && "fill-current")} />
              <span className="text-xs text-zinc-400">{formatCount(localDislikeCount)}</span>
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
            onClick={() => {
              if (isOptimistic) {
                toast('Post processing, click ⓘ for more info', {
                  icon: <Info className="w-4 h-4" />,
                });
              } else {
                setSheetOpen(true);
              }
            }}
            className="flex items-center gap-1 text-white hover:text-zinc-400 transition-colors"
            aria-label="Share"
          >
            <Share2 className="w-5 h-5" />
            <span className="text-xs text-zinc-400">{formatCount(shareCount)}</span>
          </button>
          <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
            <DrawerContent glass className="px-4 pb-6">
              <DrawerHeader className="relative">
                <DrawerTitle className="text-white/90 font-semibold">Share</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-1 mt-2 relative">
                <ShareOptions />
              </div>
            </DrawerContent>
          </Drawer>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          <motion.button 
            onClick={toggleBookmark}
            className={cn(
              "transition-colors",
              isBookmarked ? "text-yellow-500" : "text-zinc-400 hover:text-white",
              isBookmarkLoading && "opacity-50"
            )}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
            disabled={isBookmarkLoading}
            animate={isBookmarked ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
          </motion.button>
          <button 
            onClick={handleInfoClick}
            className="text-zinc-400 hover:text-white transition-colors"
            aria-label="Post info"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
