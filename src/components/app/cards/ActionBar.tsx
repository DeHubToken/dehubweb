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

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, MessageSquare, Share2, Repeat2, Quote, Link, Info, ImageDown, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { voteOnPost } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { PostUtilityButtons } from './PostUtilityButtons';
// Lazy so the DM/socket graph doesn't ride in the feed chunk — only loads when a user shares.
const SharePostToDmModal = lazy(() =>
  import('@/components/app/modals/SharePostToDmModal').then((m) => ({ default: m.SharePostToDmModal }))
);
import { getVoteCache, setVoteCache, patchFeedCaches } from '@/lib/vote-cache';
import { trackPostLinkCopy } from '@/hooks/use-link-copy-count';
import { isPostReposted, markReposted, unmarkReposted } from '@/lib/repost-cache';
import { getCommentCountDelta } from '@/lib/comment-count-cache';
import { DOUBLE_TAP_LIKE_EVENT, type DoubleTapLikeEventDetail } from '@/hooks/use-double-tap-like';
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
  onRepost?: () => void | Promise<unknown>;
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
  /** Handler for see engagements action */
  onSeeEngagements?: () => void;
  /** Whether voting buttons should be disabled (e.g. mutation pending) */
  disabled?: boolean;
  /** Handler for share-as-image action (text posts only) */
  onShareAsImage?: () => Promise<void>;
  /** Numeric token ID for pin functionality */
  tokenId?: number;
  /** Show pin button only for own posts */
  isOwnPost?: boolean;
  /**
   * Listen for double-tap-to-like events for this post (default true).
   * Set false on secondary instances of the same post (e.g. a copy of the bar
   * inside the fullscreen image viewer) so a single double-tap doesn't cast two votes.
   */
  enableDoubleTapLike?: boolean;
  /**
   * When true, the repost button reposts directly (with optimistic count bump)
   * instead of opening the share drawer. Used inside high-z overlays like the
   * fullscreen image viewer, where the z-[100] drawer would render behind it.
   */
  quickRepost?: boolean;
  /**
   * On desktop (lg+), center the actions as one cluster instead of spreading
   * them edge-to-edge (primary group left, secondary group right). Mobile/tablet
   * keep the edge-to-edge layout. Used in the fullscreen image viewer.
   */
  centered?: boolean;
  /**
   * On desktop (lg+), hide the left utility cluster (bookmark / pin / info).
   * Used by the fullscreen viewer, which lifts those buttons up to the
   * top-right chip cluster on desktop. Mobile/tablet keep them inline.
   */
  hideUtilityDesktop?: boolean;
  /**
   * Hide the utility buttons (bookmark / pin / info) at ALL breakpoints.
   * Feed cards set this and render PostUtilityButtons in their top-right
   * header cluster next to the AI button instead.
   */
  hideUtility?: boolean;
  /**
   * Feed-card layout: utility buttons (bookmark / pin / info) are hidden
   * below lg (mobile/tablet get them via the card's three-dot menu instead)
   * and anchored to the LEFT on desktop, with the engagement buttons filling
   * the remaining row width evenly. Mutually exclusive with hideUtility/
   * hideUtilityDesktop/centered — those stay on the original contents-based
   * layout used by the fullscreen viewer and other non-card consumers.
   */
  utilityDesktopAnchor?: boolean;
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
  onSeeEngagements,
  onShareAsImage,
  disabled: externalDisabled = false,
  tokenId,
  isOwnPost = false,
  enableDoubleTapLike = true,
  quickRepost = false,
  centered = false,
  hideUtilityDesktop = false,
  hideUtility = false,
  utilityDesktopAnchor = false,
}: ActionBarProps) {
  // Add localStorage delta to comment count for instant feedback
  const commentCountDelta = postId ? getCommentCountDelta(postId) : 0;
  const commentCount = (rawCommentCount ?? 0) + commentCountDelta;
  
  // Optimistic repost count: increment locally on repost for instant feedback
  const [repostDelta, setRepostDelta] = useState(0);
  const prevRepostCountRef = useRef(repostCount);
  
  // Reset delta when server data refreshes (prevents double-counting)
  if (repostCount !== prevRepostCountRef.current) {
    prevRepostCountRef.current = repostCount;
    if (repostDelta !== 0) {
      setRepostDelta(0);
    }
  }
  
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
  const [isSharingImage, setIsSharingImage] = useState(false);
  // Track when user voted locally so we don't let stale API refetches overwrite optimistic state
  const lastVoteTimeRef = useRef(cachedVote ? Date.now() : 0);
  const VOTE_GUARD_MS = 10000; // ignore prop syncs for 10s after a local vote

  const handleShareAsImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onShareAsImage || isSharingImage) return;
    // Blur focused element before closing to prevent aria-hidden conflict
    (document.activeElement as HTMLElement)?.blur();
    setIsSharingImage(true);
    setSheetOpen(false);
    // Wait for drawer close animation before capturing
    await new Promise((r) => setTimeout(r, 350));
    try {
      await onShareAsImage();
    } finally {
      setIsSharingImage(false);
    }
  };

  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const queryClient = useQueryClient();
  // When external handlers are provided (governance), always sync from props
  const hasExternalHandlers = !!(onLike || onDislike);

  // Sync local state with props when they change, but prefer vote cache over stale API props
  useEffect(() => {
    if (!hasExternalHandlers) {
      if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
      const cached = postId ? getVoteCache(postId) : null;
      if (cached) { setIsLiked(cached.isLiked); return; }
    }
    setIsLiked(initialIsLiked);
  }, [initialIsLiked]);

  useEffect(() => {
    if (!hasExternalHandlers) {
      if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
      const cached = postId ? getVoteCache(postId) : null;
      if (cached) { setIsDisliked(cached.isDisliked); return; }
    }
    setIsDisliked(initialIsDisliked);
  }, [initialIsDisliked]);

  useEffect(() => {
    if (!hasExternalHandlers) {
      if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
      const cached = postId ? getVoteCache(postId) : null;
      if (cached) { setLocalLikeCount(cached.likeCount); return; }
    }
    setLocalLikeCount(likeCount ?? 0);
  }, [likeCount]);

  useEffect(() => {
    if (!hasExternalHandlers) {
      if (Date.now() - lastVoteTimeRef.current < VOTE_GUARD_MS) return;
      const cached = postId ? getVoteCache(postId) : null;
      if (cached) { setLocalDislikeCount(cached.dislikeCount); return; }
    }
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
  
  const handleVote = useCallback(async (vote: boolean) => {
    if (!postId || isVoting || externalDisabled) return;
    
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }

    // When external handlers are provided (e.g. governance), skip local optimistic updates
    // since the parent mutation handles optimistic state via React Query cache
    const hasExternalHandler = (vote && onLike) || (!vote && onDislike);

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

    if (!hasExternalHandler) {
      // Only do local optimistic updates for regular posts (not governance)
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
      // Also patch the single-post query cache so dedicated post pages reflect the vote immediately
      queryClient.setQueriesData<any>(
        { queryKey: ['single-post', postId] },
        (old: any) => old ? {
          ...old,
          isLiked: newLiked,
          isDisliked: newDisliked,
          totalVotes: { for: newLikeCount, against: newDislikeCount },
        } : old,
      );
    }

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
          return;
        }
        await voteOnPost({ tokenId: numericId, voteType: vote ? 'for' : 'against' });
      }
      // After successful vote, softly invalidate feeds so fresh isLiked/isDisliked
      // arrives from API before the vote cache expires
      if (!hasExternalHandler) {
        // Use a short delay so the backend has time to process the vote
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'], refetchType: 'none' });
          queryClient.invalidateQueries({ queryKey: ['dehub-feed'], refetchType: 'none' });
          queryClient.invalidateQueries({ queryKey: ['profile-content'], refetchType: 'none' });
        }, 2000);
      }
    } catch (error: unknown) {
      if (!hasExternalHandler) {
        // Revert to pre-vote state on error (only for local optimistic updates)
        setIsLiked(isLiked);
        setIsDisliked(isDisliked);
        setLocalLikeCount(localLikeCount);
        setLocalDislikeCount(localDislikeCount);
        const revertState = { isLiked, isDisliked, likeCount: localLikeCount, dislikeCount: localDislikeCount };
        setVoteCache(postId, revertState);
        patchFeedCaches(queryClient, postId, revertState);
        queryClient.setQueriesData<any>(
          { queryKey: ['single-post', postId] },
          (old: any) => old ? {
            ...old,
            isLiked,
            isDisliked,
            totalVotes: { for: localLikeCount, against: localDislikeCount },
          } : old,
        );
      }
      toast.error('Failed to vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  }, [postId, isVoting, externalDisabled, isLiked, isDisliked, localLikeCount, localDislikeCount, isAuthenticated, queryClient, onLike, onDislike]);

  // Listen for double-tap-to-like events dispatched by photo thumbnails / fullscreen viewer.
  // Instagram-style: double-tap always likes (never unlikes) and only for this post's ID.
  const handleVoteRef = useRef(handleVote);
  useEffect(() => { handleVoteRef.current = handleVote; }, [handleVote]);
  useEffect(() => {
    if (!postId || !enableDoubleTapLike) return;
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<DoubleTapLikeEventDetail>).detail;
      if (!detail || String(detail.postId) !== String(postId)) return;
      if (isLiked) return; // already liked — don't toggle off on double-tap
      handleVoteRef.current(true);
    };
    window.addEventListener(DOUBLE_TAP_LIKE_EVENT, listener as EventListener);
    return () => window.removeEventListener(DOUBLE_TAP_LIKE_EVENT, listener as EventListener);
  }, [postId, isLiked, enableDoubleTapLike]);

  const hasVoted = isLiked || isDisliked;

  const handleCopyLink = () => {
    const url = postId
      ? `${window.location.origin}/app/post/${postId}`
      : window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Post URL copied to clipboard');
    // Feed copies feed the same reposts+copies share counter shown on shorts
    if (postId) trackPostLinkCopy(postId, walletAddress);
    setSheetOpen(false);
  };

  const [isReposted, setIsReposted] = useState(() => initialIsReposted || (postId ? isPostReposted(postId) : false));

  useEffect(() => {
    setRepostDelta(0);
    setIsReposted(initialIsReposted || (postId ? isPostReposted(postId) : false));
  }, [initialIsReposted, postId, walletAddress]);

  const handleRepost = () => {
    if (onRepost) {
      setRepostDelta(prev => prev + 1);
      setIsReposted(true);
      if (postId) markReposted(postId);
      // Roll back the optimistic +1 / filled icon if the card's API call
      // rejects (cards rethrow after their own error toast).
      Promise.resolve(onRepost()).catch(() => {
        setRepostDelta(prev => prev - 1);
        setIsReposted(false);
        if (postId) unmarkReposted(postId);
      });
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
      // Same API call toggles the repost off; restore state if it rejects.
      Promise.resolve(onRepost()).catch(() => {
        setRepostDelta(prev => prev + 1);
        setIsReposted(true);
        if (postId) markReposted(postId);
      });
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

  // "Send in a message" — only for real posts (numeric tokenId). Feature-request
  // and governance cards reuse ActionBar with non-post ids and must not show it.
  const canSendInDm = typeof tokenId === 'number' && tokenId > 0;
  const [dmShareOpen, setDmShareOpen] = useState(false);
  const handleSendInDm = () => {
    setSheetOpen(false);
    if (!isAuthenticated) { openLoginModal(); return; }
    setDmShareOpen(true);
  };

  const ShareOptions = () => (
    <>
      {canSendInDm && (
        <button
          onClick={(e) => { e.stopPropagation(); handleSendInDm(); }}
          className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
        >
          <Send className="w-5 h-5" />
          <span className="font-medium">Send in a message</span>
        </button>
      )}
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
      {onShareAsImage && (
        <button
          onClick={handleShareAsImage}
          disabled={isSharingImage}
          className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 disabled:opacity-50"
        >
          <ImageDown className="w-5 h-5" />
          <span className="font-medium">{isSharingImage ? 'Capturing...' : 'Share as Image'}</span>
        </button>
      )}
      {onSeeEngagements && (
        <button
          onClick={(e) => { e.stopPropagation(); setSheetOpen(false); onSeeEngagements(); }}
          className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
        >
          <Repeat2 className="w-5 h-5" />
          <span className="font-medium">See Engagements</span>
        </button>
      )}
    </>
  );

  // Engagement actions — order left → right: tip · dislike · share · comment · like
  const engagementButtons = (
    <>
      {/* Tip counter (diamond) */}
      <button
        onClick={(e) => { e.stopPropagation(); onTip?.(); }}
        className="flex items-center gap-0 text-white hover:text-zinc-400 transition-colors"
        aria-label="Tips"
      >
         <Gem className="w-[17px] h-[17px] text-white" />
        <span className="text-xs text-zinc-400 relative z-10" style={{ marginLeft: '2.5px' }}>{formatCount(tipCount)}</span>
      </button>

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

      {/* Share - opens share sheet with repost/quote/copy-link/etc options */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isOptimistic) {
            toast.message('Post processing, click ⓘ for more info', {
              icon: <Info className="w-4 h-4" />,
            });
          } else if (quickRepost) {
            // Constrained overlays (fullscreen viewer) can't show the z-[100]
            // share drawer above the viewer — repost/undo directly instead.
            if (isReposted) {
              handleUndoRepost();
            } else {
              handleRepost();
            }
          } else {
            setSheetOpen(true);
          }
        }}
        className="flex items-center gap-0.5 text-white hover:text-zinc-400 transition-colors"
        aria-label="Share"
      >
        <Share2 className={isReposted ? "w-[1.5213rem] h-[1.5213rem]" : "w-[1.3965rem] h-[1.3965rem]"} strokeWidth={isReposted ? 2.915 : 2} />
        <span className="text-xs text-zinc-400">{formatCount(displayRepostCount)}</span>
      </button>

      <button
        onClick={onComment}
        className="flex items-center gap-0.5 text-white hover:text-zinc-400 transition-colors"
        aria-label="Comment"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-xs text-zinc-400">{formatCount(commentCount)}</span>
      </button>

      {/* Like — furthest right for easy thumb reach */}
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
    </>
  );

  return (
    <div className={cn(
      "p-3",
      showBorder && "border-t border-zinc-800",
      className
    )}>
      {utilityDesktopAnchor ? (
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
          {/* Utility cluster — hidden on mobile/tablet (the card's three-dot
              menu carries bookmark/pin/info there instead). On desktop it's a
              real flex item of this justify-between row (not a separately-
              margined sibling), so the gap to the first engagement button
              matches the gaps between every other button. */}
          {!hideUtility && (
            <div className="hidden lg:flex items-center gap-4 shrink-0">
              <PostUtilityButtons
                postId={postId}
                tokenId={tokenId}
                isOwnPost={isOwnPost}
                variant="inline"
              />
            </div>
          )}
          {/* display:contents so each engagement button is its own flex item
              of the row too, spacing evenly against the utility cluster and
              each other alike. */}
          <div className="contents">
            {engagementButtons}
          </div>
        </div>
      ) : (
        <div className={cn(
          "flex flex-wrap items-center gap-y-2 gap-x-2 justify-between",
          centered && "lg:justify-center lg:gap-x-4"
        )}>
          {/* Utility actions (bookmark, pin, info) — display:contents so every
              button is a direct flex item of the row: all actions distribute
              evenly edge-to-edge across the card width regardless of count.
              Hidden on desktop when the host lifts them to a top-right cluster. */}
          {!hideUtility && (
            <div className={cn(
              "contents",
              hideUtilityDesktop && "lg:hidden"
            )}>
              <PostUtilityButtons
                postId={postId}
                tokenId={tokenId}
                isOwnPost={isOwnPost}
                variant="inline"
              />
            </div>
          )}
          <div className="contents">
            {engagementButtons}
          </div>
        </div>
      )}

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

      {canSendInDm && dmShareOpen && (
        <Suspense fallback={null}>
          <SharePostToDmModal open={dmShareOpen} onOpenChange={setDmShareOpen} tokenId={tokenId!} />
        </Suspense>
      )}
    </div>
  );
}
