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
import { useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Bookmark, Repeat2, Quote, Link, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { voteOnPost } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { getVoteCache, setVoteCache, patchFeedCaches } from '@/lib/vote-cache';
import { isPostReposted, markReposted, unmarkReposted } from '@/lib/repost-cache';
import { getCommentCountDelta } from '@/lib/comment-count-cache';
import { Gem } from 'lucide-react';
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
  /** Repost count to display */
  repostCount?: number;
  /** Whether the current user has already reposted this post */
  isReposted?: boolean;
  /** Whether this is an optimistic (processing) post */
  isOptimistic?: boolean;
  /** Handler for like action (overrides default voteOnPost) */
  onLike?: () => void;
  /** Handler for dislike action (overrides default voteOnPost) */
  onDislike?: () => void;
  /** Vote weight multiplier for optimistic count updates (default: 1) */
  voteWeight?: number;
  /** Tip count to display next to repost */
  tipCount?: number;
  /** Handler for tip action */
  onTip?: () => void;
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
  onLike,
  onDislike,
  className,
  showBorder = false,
  isLiked: initialIsLiked = false,
  isDisliked: initialIsDisliked = false,
  hideDislike = false,
  likeCount,
  dislikeCount,
  commentCount: rawCommentCount,
  shareCount,
  repostCount,
  isReposted: initialIsReposted = false,
  isOptimistic = false,
  voteWeight = 1,
  tipCount,
  onTip,
}: ActionBarProps) {
  // Add localStorage delta to comment count for instant feedback
  const commentCountDelta = postId ? getCommentCountDelta(postId) : 0;
  const commentCount = (rawCommentCount ?? 0) + commentCountDelta;
  
  // Optimistic repost count: increment locally on repost for instant feedback
  const [repostDelta, setRepostDelta] = useState(0);
  const displayRepostCount = (repostCount ?? 0) + repostDelta;
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
  const queryClient = useQueryClient();
  
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

  // Propagate API-sourced like/dislike state to all feed caches
  // so old likes from previous sessions sync across all feeds
  useEffect(() => {
    if (!postId) return;
    if ((!initialIsLiked && !initialIsDisliked) || getVoteCache(postId)) return;
    patchFeedCaches(queryClient, postId, {
      isLiked: initialIsLiked,
      isDisliked: initialIsDisliked,
      likeCount: likeCount ?? 0,
      dislikeCount: dislikeCount ?? 0,
    });
  }, [initialIsLiked, initialIsDisliked, postId]);
  
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

    // Compute the final state ONCE upfront from current values (stable within this render)
    let newLiked = isLiked, newDisliked = isDisliked;
    let newLikeCount = localLikeCount, newDislikeCount = localDislikeCount;

    if (isRemovingVote) {
      if (vote) { newLiked = false; newLikeCount = Math.max(0, newLikeCount - voteWeight); }
      else { newDisliked = false; newDislikeCount = Math.max(0, newDislikeCount - voteWeight); }
    } else if (isSwitchingVote) {
      if (vote) { newLiked = true; newDisliked = false; newLikeCount += voteWeight; newDislikeCount = Math.max(0, newDislikeCount - voteWeight); }
      else { newDisliked = true; newLiked = false; newDislikeCount += voteWeight; newLikeCount = Math.max(0, newLikeCount - voteWeight); }
    } else {
      if (vote) { newLiked = true; newLikeCount += voteWeight; }
      else { newDisliked = true; newDislikeCount += voteWeight; }
    }

    setIsVoting(true);
    lastVoteTimeRef.current = Date.now();

    // Optimistic UI update using computed values
    setIsLiked(newLiked);
    setIsDisliked(newDisliked);
    setLocalLikeCount(newLikeCount);
    setLocalDislikeCount(newDislikeCount);
    if (!isRemovingVote) setJustVoted(vote ? 'like' : 'dislike');
    setTimeout(() => setJustVoted(null), 400);

    // Sync global vote cache & all feed caches synchronously with computed values
    const voteState = { isLiked: newLiked, isDisliked: newDisliked, likeCount: newLikeCount, dislikeCount: newDislikeCount };
    setVoteCache(postId, voteState);
    patchFeedCaches(queryClient, postId, voteState);

    try {
      // Use override if provided, otherwise default to voteOnPost
      if (vote && onLike) {
        await onLike();
      } else if (!vote && onDislike) {
        await onDislike();
      } else {
        const numericId = parseInt(postId, 10);
        if (isNaN(numericId)) {
          console.warn('[ActionBar] Non-numeric postId used without override handler:', postId);
          // For non-numeric IDs, we don't call voteOnPost but we keep the optimistic UI state
          // This allows Supabase-based IDs to at least look like they are working if the parent
          // eventually syncs the state.
          return;
        }
        await voteOnPost({ tokenId: numericId, voteType: vote ? 'for' : 'against' });
      }
    } catch (error: unknown) {
      // Revert to pre-vote state on error
      setIsLiked(isLiked);
      setIsDisliked(isDisliked);
      setLocalLikeCount(localLikeCount);
      setLocalDislikeCount(localDislikeCount);
      const revertState = { isLiked, isDisliked, likeCount: localLikeCount, dislikeCount: localDislikeCount };
      setVoteCache(postId, revertState);
      patchFeedCaches(queryClient, postId, revertState);
      toast.error('Failed to vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  }, [postId, isVoting, isLiked, isDisliked, localLikeCount, localDislikeCount, isAuthenticated, queryClient]);

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

  const [isReposted, setIsReposted] = useState(() => initialIsReposted || (postId ? isPostReposted(postId) : false));

  const handleRepost = () => {
    if (onRepost) {
      setRepostDelta(prev => prev + 1);
      setIsReposted(true);
      if (postId) markReposted(postId);
      onRepost();
      toast.success('Reposted!');
    } else {
      toast.info('Repost not available for this post');
    }
    setSheetOpen(false);
  };

  const handleUndoRepost = () => {
    if (onRepost) {
      setRepostDelta(prev => prev - 1);
      setIsReposted(false);
      if (postId) unmarkReposted(postId);
      onRepost(); // Same API call toggles the repost off
      toast.success('Repost removed');
    }
    setSheetOpen(false);
  };

  const handleQuote = () => {
    if (onQuote) {
      onQuote();
    } else {
      toast.info('Quote not available for this post');
    }
    setSheetOpen(false);
  };

  const ShareOptions = () => (
    <>
      {isReposted ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleUndoRepost(); }}
          className="flex items-center gap-3 w-full p-4 text-red-400 hover:text-red-300 hover:bg-white/10 rounded-xl transition-all duration-200"
        >
          <Repeat2 className="w-5 h-5" />
          <span className="font-medium">Undo Repost</span>
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); handleRepost(); }}
          className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
        >
          <Repeat2 className="w-5 h-5" />
          <span className="font-medium">Repost</span>
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); handleQuote(); }}
        className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
      >
        <Quote className="w-5 h-5" />
        <span className="font-medium">Quote</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}
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
        <div className="flex items-center gap-3 lg:gap-3 xl:gap-4 min-w-0">
          <motion.button 
            onClick={() => handleVote(true)}
            className={cn(
              "flex items-center gap-0.5 transition-colors text-white",
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
                "flex items-center gap-0.5 transition-colors text-white",
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
            className="flex items-center gap-0.5 text-white hover:text-zinc-400 transition-colors"
            aria-label="Comment"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-xs text-zinc-400">{formatCount(commentCount)}</span>
          </button>
          
          {/* Repost - opens share sheet with repost/quote options */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (isOptimistic) {
                toast('Post processing, click ⓘ for more info', {
                  icon: <Info className="w-4 h-4" />,
                });
              } else {
                setSheetOpen(true);
              }
            }}
            className="flex items-center gap-0.5 text-white hover:text-zinc-400 transition-colors"
            aria-label="Repost"
          >
            <Repeat2 className={isReposted ? "w-[1.634rem] h-[1.634rem]" : "w-6 h-6"} strokeWidth={isReposted ? 2.915 : 2} />
            <span className="text-xs text-zinc-400">{formatCount(displayRepostCount)}</span>
          </button>

          {/* Tip counter */}
          <button
            onClick={(e) => { e.stopPropagation(); onTip?.(); }}
            className="flex items-center gap-0 text-white hover:text-zinc-400 transition-colors"
            aria-label="Tips"
          >
             <Gem className="w-[18px] h-[18px] text-white" />
            <span className="text-xs text-zinc-400 relative z-10" style={{ marginLeft: '1.5px' }}>{formatCount(tipCount)}</span>
          </button>

          
          <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
            <DrawerContent glass className="px-4 pb-6" data-no-navigate onClick={(e: React.MouseEvent) => e.stopPropagation()} onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}>
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
