/**
 * Shorts Viewer Component
 * =======================
 * Full-screen shorts viewer with TikTok-style vertical carousel.
 * Renders 3 videos (prev/current/next) for smooth transitions.
 * Uses Framer Motion for smooth translateY animations.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, ChevronUp, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare, Bookmark, Share2, Send, ChevronLeft, MoreHorizontal, Eye, Gem, Info, Flag, Ban, UserPlus, UserCheck, Loader2, Trash2, EyeOff, Globe } from 'lucide-react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { voteOnPost, getNFTComments, postComment, isFollowing as checkIsFollowing, updateTokenVisibility, type TokenVisibility, type ApiCommentResponse } from '@/lib/api/dehub';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { toast } from 'sonner';
import { CommentsSection } from './CommentsSection';
import { TipModal } from '../modals/TipModal';
import { ReportModal } from '../modals/ReportModal';
import { DeletePostModal } from '../modals/DeletePostModal';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Repeat2, Quote, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShortVideo } from '@/types/feed.types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import { VideoSlide } from './VideoSlide';
import { setVoteCache, getVoteCache } from '@/lib/vote-cache';
import { getVideoPreferences, setPlaybackRate as vpSetPlaybackRate, PLAYBACK_RATES, formatRate } from '@/lib/video-preferences';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { usePostLinkCopyCount, trackPostLinkCopy } from '@/hooks/use-link-copy-count';

interface ShortsViewerProps {
  shorts: ShortVideo[];
  initialIndex: number;
  onClose: () => void;
  /** Callback to load more shorts when reaching near the end */
  onLoadMore?: () => void;
  /** Whether there are more shorts to load */
  hasMore?: boolean;
  /** Whether currently loading more shorts */
  isLoadingMore?: boolean;
}

/** Format count for display (e.g., 1500 -> 1.5K) */
function formatCount(count?: number | string): string {
  if (typeof count === 'string') return count;
  const value = count ?? 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toString();
}

/** Expandable post description with Show more / Show less */
function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div className="mt-2 lg:mt-3 flex-shrink-0">
      <div className={cn(expanded && "max-h-[7.5rem] overflow-y-auto") }>
        <p
          ref={ref}
          className={cn("text-white/80 text-xs lg:text-sm", !expanded && "line-clamp-2")}
        >
          {text}
        </p>
      </div>
      {(clamped || expanded) && (
        <button
          onClick={() => setExpanded(p => !p)}
          className="text-white/50 hover:text-white text-[11px] mt-0.5 transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/** Map API comment to display format */
interface InlineComment {
  id: string;
  username: string;
  avatar?: string;
  text: string;
  timeAgo: string;
  address?: string;
}

function mapApiCommentToInline(apiComment: ApiCommentResponse): InlineComment {
  const address = apiComment.address;
  const rawAvatarPath = apiComment.writor?.avatarUrl;
  const resolvedAvatar = address && rawAvatarPath 
    ? buildAvatarUrl(address, rawAvatarPath) 
    : undefined;
  
  return {
    id: String(apiComment.id),
    username: apiComment.writor?.username || 'Anonymous',
    avatar: resolvedAvatar,
    text: apiComment.content,
    timeAgo: formatTimeAgo(apiComment.createdAt),
    address,
  };
}

// Smooth tween transition - eliminates spring overshoot for buttery landing
const SMOOTH_TRANSITION = {
  type: 'tween',
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1], // CSS ease-out equivalent
} as const;

export function ShortsViewer({ shorts, initialIndex, onClose, onLoadMore, hasMore, isLoadingMore }: ShortsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showPlayIndicator, setShowPlayIndicator] = useState<'play' | 'pause' | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [commentsInitialTab, setCommentsInitialTab] = useState<'replies' | 'quotes' | 'reposts' | 'likers' | 'search' | undefined>(undefined);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const [inlineCommentText, setInlineCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [overlaysHidden, setOverlaysHidden] = useState(false);
  const [isTimelineSeeking, setIsTimelineSeeking] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(() => getVideoPreferences().playbackRate);
  
  // Gesture tracking for overlay hide/show
  const overlaySwipeStartY = useRef<number | null>(null);
  const overlaySwipeStartX = useRef<number | null>(null);
  
  // Drag state for visual feedback
  const [dragOffset, setDragOffset] = useState(0);
  
  // Voting state - synced with API
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(0);
  const [localDislikeCount, setLocalDislikeCount] = useState(0);
  const [isVoting, setIsVoting] = useState(false);
  const [justVoted, setJustVoted] = useState<'like' | 'dislike' | null>(null);

  const inlineCommentRef = useRef<HTMLInputElement>(null);
  const mention = useMention({
    inputRef: inlineCommentRef,
    onMentionInsert: (_user, newText) => setInlineCommentText(newText),
  });
  
  // Follow state — shared cross-surface overrides win over the local session set
  const [followedCreators, setFollowedCreators] = useState<Set<string>>(new Set());
  const [followCheckingCreators, setFollowCheckingCreators] = useState<Set<string>>(new Set());
  const followOverrides = useFollowOverrides();
  const isCreatorFollowed = useCallback((addr?: string | null) =>
    !!addr && (followOverrides.get(addr.toLowerCase()) ?? followedCreators.has(addr)),
  [followOverrides, followedCreators]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();

  const currentShort = shorts[currentIndex];
  const isOwnShort = !!walletAddress && currentShort?.creatorId?.toLowerCase() === walletAddress.toLowerCase();
  const [showTipModal, setShowTipModal] = useState(false);
  const { data: tipCount = 0 } = usePostTipCount(currentShort?.id);

  // Share counter = reposts + link copies, with local optimistic bumps.
  // copiedIdsRef stops repeat copies of the same short inflating the count.
  const { data: linkCopyCount = 0 } = usePostLinkCopyCount(currentShort?.id);
  const [shareDelta, setShareDelta] = useState(0);
  const copiedIdsRef = useRef<Set<string>>(new Set());
  const displayShareCount = (currentShort?.repostCount ?? 0) + linkCopyCount + shareDelta;
  
  // View tracking for the current short
  const { onTimeUpdate: trackView } = useVideoViewTracking(currentShort?.id);
  
  // Compute visible indices for the 3-video window
  const visibleIndices = useMemo(() => {
    return [
      currentIndex - 1, // Previous
      currentIndex,     // Current
      currentIndex + 1, // Next
    ].filter(i => i >= 0 && i < shorts.length);
  }, [currentIndex, shorts.length]);
  
  // Navigate to creator profile
  const handleNavigateToProfile = useCallback(() => {
    const username = currentShort?.creatorUsername || currentShort?.username;
    if (username) {
      onClose();
      navigate(`/${username}`);
    }
  }, [currentShort?.creatorUsername, currentShort?.username, navigate, onClose]);
  
  const queryClient = useQueryClient();

  // Handle follow creator — optimistic: flips everywhere instantly, reverts on error
  const handleFollow = useCallback(() => {
    const creatorAddress = currentShort?.creatorId;
    if (!creatorAddress) {
      toast.error('Unable to follow - creator not found');
      return;
    }

    if (!isAuthenticated) {
      openLoginModal();
      return;
    }

    if (isCreatorFollowed(creatorAddress)) {
      return;
    }

    setFollowedCreators(prev => new Set(prev).add(creatorAddress));
    toggleFollowFor(queryClient, creatorAddress, false, {
      name: currentShort.displayName || currentShort.creatorUsername || currentShort.username,
      onError: () => {
        setFollowedCreators(prev => {
          const next = new Set(prev);
          next.delete(creatorAddress);
          return next;
        });
        toast.error('Failed to follow user');
      },
    });
  }, [currentShort, isAuthenticated, openLoginModal, isCreatorFollowed, queryClient]);

  // Bookmark hook
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(currentShort?.id || '');
  
  // Fetch inline comments
  const { data: inlineComments = [] } = useQuery({
    queryKey: ['shorts-inline-comments', currentShort?.id, walletAddress],
    queryFn: async () => {
      if (!currentShort?.id) return [];
      const response = await getNFTComments(currentShort.id, 0, 50, walletAddress?.toLowerCase());
      return response.map(mapApiCommentToInline);
    },
    enabled: !!currentShort?.id,
    staleTime: 30000,
  });
  
  // Handle posting inline comment
  const handlePostInlineComment = useCallback(async () => {
    if (!inlineCommentText.trim() || !currentShort?.id || isPostingComment) return;
    
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    
    setIsPostingComment(true);
    try {
      await postComment(currentShort.id, inlineCommentText.trim());
      setInlineCommentText('');
      queryClient.invalidateQueries({ queryKey: ['shorts-inline-comments', currentShort.id] });
      toast.success('Comment posted!');
    } catch (error) {
      toast.error('Failed to post comment');
    } finally {
      setIsPostingComment(false);
    }
  }, [inlineCommentText, currentShort?.id, isPostingComment, isAuthenticated, queryClient]);
  
  // Sync voting state from short data when changing videos
  // Check vote cache first to preserve optimistic updates across scroll
  useEffect(() => {
    const cached = currentShort?.id ? getVoteCache(String(currentShort.id)) : null;
    if (cached) {
      setIsLiked(cached.isLiked);
      setIsDisliked(cached.isDisliked);
      setLocalLikeCount(cached.likeCount);
      setLocalDislikeCount(cached.dislikeCount);
    } else {
      setIsLiked(currentShort?.isLiked ?? false);
      setIsDisliked(currentShort?.isDisliked ?? false);
      const likes = typeof currentShort?.likes === 'string' 
        ? parseInt(currentShort.likes.replace(/[^0-9]/g, '')) || 0 
        : (currentShort?.likes as unknown as number) || 0;
      setLocalLikeCount(likes);
      setLocalDislikeCount(0);
    }
    setShowComments(false);
    setCommentsInitialTab(undefined);
    setInlineCommentText('');
    setIsDescriptionExpanded(false);
    setIsPaused(false);
    setShareDelta(0);
  }, [currentIndex, currentShort?.id, currentShort?.likes, currentShort?.isLiked, currentShort?.isDisliked]);
  
  // Check follow status from API when creator changes
  useEffect(() => {
    const creatorAddress = currentShort?.creatorId;
    if (!creatorAddress || !isAuthenticated || followedCreators.has(creatorAddress)) return;
    
    setFollowCheckingCreators(prev => new Set(prev).add(creatorAddress));
    let cancelled = false;
    checkIsFollowing(creatorAddress).then(result => {
      if (!cancelled) {
        if (result) {
          setFollowedCreators(prev => new Set(prev).add(creatorAddress));
        }
        setFollowCheckingCreators(prev => {
          const next = new Set(prev);
          next.delete(creatorAddress);
          return next;
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setFollowCheckingCreators(prev => {
          const next = new Set(prev);
          next.delete(creatorAddress);
          return next;
        });
      }
    });
    
    return () => { cancelled = true; };
  }, [currentShort?.creatorId, isAuthenticated]);

  // Handle voting
  const handleVote = useCallback(async (vote: boolean) => {
    const tokenId = String(currentShort?.id);
    
    if (!tokenId || tokenId === 'undefined' || isVoting) return;
    
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }

    const isRemovingVote = (vote && isLiked) || (!vote && isDisliked);
    const isSwitchingVote = (vote && isDisliked) || (!vote && isLiked);

    setIsVoting(true);
    
    // Compute new optimistic state
    let newLiked = isLiked;
    let newDisliked = isDisliked;
    let likeDelta = 0;
    let dislikeDelta = 0;

    if (isRemovingVote) {
      if (vote) { newLiked = false; likeDelta = -1; }
      else { newDisliked = false; dislikeDelta = -1; }
    } else if (isSwitchingVote) {
      if (vote) { newLiked = true; newDisliked = false; likeDelta = 1; dislikeDelta = -1; setJustVoted('like'); }
      else { newDisliked = true; newLiked = false; dislikeDelta = 1; likeDelta = -1; setJustVoted('dislike'); }
    } else {
      if (vote) { newLiked = true; likeDelta = 1; setJustVoted('like'); }
      else { newDisliked = true; dislikeDelta = 1; setJustVoted('dislike'); }
    }

    // Apply optimistic UI
    setIsLiked(newLiked);
    setIsDisliked(newDisliked);
    setLocalLikeCount(prev => {
      const newCount = Math.max(0, prev + likeDelta);
      // Cache after computing final values
      setVoteCache(tokenId, { isLiked: newLiked, isDisliked: newDisliked, likeCount: newCount, dislikeCount: Math.max(0, localDislikeCount + dislikeDelta) });
      return newCount;
    });
    setLocalDislikeCount(prev => Math.max(0, prev + dislikeDelta));
    
    setTimeout(() => setJustVoted(null), 400);

    try {
      await voteOnPost({ tokenId: parseInt(tokenId, 10), voteType: vote ? 'for' : 'against' });
    } catch (error) {
      // Revert on error
      setIsLiked(isLiked);
      setIsDisliked(isDisliked);
      setLocalLikeCount(prev => Math.max(0, prev - likeDelta));
      setLocalDislikeCount(prev => Math.max(0, prev - dislikeDelta));
      // Clear stale cache on error
      setVoteCache(tokenId, { isLiked, isDisliked, likeCount: Math.max(0, localLikeCount), dislikeCount: Math.max(0, localDislikeCount) });
      toast.error('Failed to vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  }, [currentShort?.id, isVoting, isLiked, isDisliked, isAuthenticated, localLikeCount, localDislikeCount]);

  // Lock body scroll when viewer is open, and flag the fullscreen state so the
  // top nav bars (home tab bar z-[110], mobile header z-[60]) drop beneath the
  // viewer and get frosted by its backdrop-blur instead of poking through sharp.
  // See the `body.shorts-viewer-open` rules in index.css.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    // NB: do NOT set `touch-action: none` on <body>. It cascades to the whole
    // subtree and kills touch-scrolling inside the inline comments panel
    // (which is a descendant, not a portalled drawer), leaving the sheet
    // frozen. `overflow: hidden` already locks the page, and body keeps its
    // global `overscroll-behavior: none` from index.css to stop pull-to-refresh.
    document.body.classList.add('shorts-viewer-open');

    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('shorts-viewer-open');
    };
  }, []);

  const goToNext = useCallback(() => {
    if (currentIndex < shorts.length - 1 && !isTransitioning) {
      setIsTransitioning(true);
      setCurrentIndex(prev => prev + 1);
      setTimeout(() => setIsTransitioning(false), 350);
    }
    // Load more when within 3 items of the end
    if (currentIndex >= shorts.length - 4 && hasMore && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [currentIndex, shorts.length, hasMore, isLoadingMore, onLoadMore, isTransitioning]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0 && !isTransitioning) {
      setIsTransitioning(true);
      setCurrentIndex(prev => prev - 1);
      setTimeout(() => setIsTransitioning(false), 350);
    }
  }, [currentIndex, isTransitioning]);

  // Handle mouse wheel scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isTransitioning) return;
      
      const threshold = 50;
      if (Math.abs(e.deltaY) < threshold) return;

      if (e.deltaY > 0) {
        goToNext();
      } else {
        goToPrev();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => container.removeEventListener('wheel', handleWheel, { capture: true });
  }, [goToNext, goToPrev, isTransitioning]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'ArrowDown' || e.key === 'j') goToNext();
      else if (e.key === 'ArrowUp' || e.key === 'k') goToPrev();
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'm') setIsMuted(prev => !prev);
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, onClose]);

  // Handle drag for visual feedback during swipe
  const handleDrag = useCallback((_: any, info: PanInfo) => {
    setDragOffset(info.offset.y);
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setDragOffset(0);
    
    // Navigate based on drag velocity and offset
    const swipeThreshold = 80;
    const velocityThreshold = 300;
    
    if (info.offset.y < -swipeThreshold || info.velocity.y < -velocityThreshold) {
      goToNext();
    } else if (info.offset.y > swipeThreshold || info.velocity.y > velocityThreshold) {
      goToPrev();
    }
  }, [goToNext, goToPrev]);

  // Toggle play/pause - only shows indicator on explicit tap
  const togglePlayPause = useCallback(() => {
    // Don't show indicator during transitions
    if (isTransitioning) return;
    
    setIsPaused(prev => {
      const newPaused = !prev;
      setShowPlayIndicator(newPaused ? 'pause' : 'play');
      setTimeout(() => setShowPlayIndicator(null), 500);
      return newPaused;
    });
  }, [isTransitioning]);

  // Prevent touch events from bubbling to parent page
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // Overlay hide/show gesture handlers - integrated with drag system
  const handleOverlayGestureTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    
    const touch = e.touches[0];
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    
    // Track if touch started in bottom 1/5 OR right 1/5 for swipe-down detection
    const inBottomZone = touch.clientY > screenHeight * 0.8;
    const inRightZone = touch.clientX > screenWidth * 0.8;
    
    if (inBottomZone || inRightZone) {
      overlaySwipeStartY.current = touch.clientY;
      overlaySwipeStartX.current = touch.clientX;
    } else {
      overlaySwipeStartY.current = null;
      overlaySwipeStartX.current = null;
    }
  }, [isMobile]);

  const handleOverlayGestureTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    
    const touch = e.changedTouches[0];
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    
    // Need start position to determine gesture
    if (overlaySwipeStartY.current === null || overlaySwipeStartX.current === null) {
      return;
    }
    
    const deltaY = touch.clientY - overlaySwipeStartY.current;
    const deltaX = Math.abs(touch.clientX - overlaySwipeStartX.current);
    const isTap = Math.abs(deltaY) < 20 && deltaX < 20;
    const isVerticalSwipe = Math.abs(deltaY) > 40 && Math.abs(deltaY) > deltaX;
    
    const inBottomZone = overlaySwipeStartY.current > screenHeight * 0.8;
    const inRightZone = overlaySwipeStartX.current > screenWidth * 0.8;
    const endInTopZone = touch.clientY < screenHeight * 0.2;
    const endInBottomZone = touch.clientY > screenHeight * 0.8;
    const endInRightZone = touch.clientX > screenWidth * 0.8;
    
    // Ignore navigation-sized swipes (those that change slides) — only respond to small deliberate gestures
    const isNavigationSwipe = Math.abs(deltaY) > 80;
    
    if (overlaysHidden) {
      // Restore overlays: only small swipe UP in edge zones (not taps, not navigation swipes)
      if (isVerticalSwipe && !isNavigationSwipe && deltaY < -40 && (inBottomZone || inRightZone)) {
        setOverlaysHidden(false);
      }
    } else {
      // Hide overlays: swipe down in bottom/right zone
      if (isVerticalSwipe && deltaY > 40 && (inBottomZone || inRightZone)) {
        setOverlaysHidden(true);
      }
    }
    
    overlaySwipeStartY.current = null;
    overlaySwipeStartX.current = null;
  }, [isMobile, overlaysHidden]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/app/post/${currentShort.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Post URL copied to clipboard');
    // Count the copy toward the share counter (once per short per session)
    if (currentShort?.id && !copiedIdsRef.current.has(currentShort.id)) {
      copiedIdsRef.current.add(currentShort.id);
      trackPostLinkCopy(currentShort.id, walletAddress);
      setShareDelta(prev => prev + 1);
    }
    setShareSheetOpen(false);
  };

  const handleRepost = async () => {
    if (!walletAddress) { setShareSheetOpen(false); return; }
    const id = currentShort?.id;
    if (!id) return;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return;
    // Optimistic: bump the counter + toast instantly, revert on failure.
    setShareDelta(prev => prev + 1);
    toast.success('Reposted!');
    setShareSheetOpen(false);
    try {
      const { repostPost } = await import('@/lib/api/dehub');
      await repostPost(numericId);
    } catch {
      setShareDelta(prev => prev - 1);
      toast.error('Failed to repost');
    }
  };

  const handleQuote = () => {
    toast.info('Quote for shorts coming soon!');
    setShareSheetOpen(false);
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("fixed inset-0 z-[60] flex items-center justify-center", isMobile ? "bg-black" : "bg-black/60 backdrop-blur-[24px]")}
      // `overscroll-behavior: contain` stops scroll-chaining/rubber-banding
      // without the `touch-action: none` that used to freeze the comments
      // panel. The video carousel manages its own swipe gestures via Framer's
      // drag (it sets `touch-action: pan-x` on the drag layer itself).
      style={{ overscrollBehavior: 'contain' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Layout with Side Panels */}
      <div className={cn("relative flex h-full", isMobile ? "w-full flex-col" : "items-center justify-center gap-4 px-4")}>
        
        {/* Left Side - Desktop Only: prev/next navigation. The action buttons
            now live in a horizontal bar across the bottom of the video (feed
            post card style) instead of a side panel. */}
        {!isMobile && (
          <div className="w-[60px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col items-center justify-center gap-3">
            <button
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={goToNext}
              disabled={currentIndex === shorts.length - 1}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>
          </div>
        )}

        {/* Video Container - Vertical Carousel Stack.
            On mobile, when comments are open it shrinks to the top half so the
            comments panel below can take the bottom half (Instagram-style split). */}
        <motion.div
          className={cn(
            "relative overflow-hidden",
            isMobile
              ? "w-full shrink-0 bg-black"
              : "shrink-0 h-[calc(100vh-80px)] max-h-[640px] aspect-[9/16] w-auto bg-zinc-900 rounded-none md:rounded-2xl"
          )}
          animate={isMobile ? { height: showComments ? '42%' : '100%' } : undefined}
          transition={SMOOTH_TRANSITION}
        >
          
          {/* Draggable carousel container */}
          <motion.div
            className="absolute inset-0"
            drag={isTimelineSeeking ? false : 'y'}
            dragListener={!isTimelineSeeking}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
          >
            {/* Render window of 3 videos (prev/current/next) */}
            <AnimatePresence initial={false}>
              {visibleIndices.map(index => {
                const short = shorts[index];
                const offset = index - currentIndex;
                const isActive = index === currentIndex;
                
                return (
                  <motion.div
                    key={short.id}
                    className="absolute inset-0"
                    initial={false}
                    animate={{
                      y: `${offset * 100}%`,
                      // Add drag offset to create the "train car" effect
                      translateY: isActive ? dragOffset : dragOffset * 0.3,
                    }}
                    transition={dragOffset === 0 ? SMOOTH_TRANSITION : { duration: 0 }}
                    style={{ zIndex: isActive ? 2 : 1 }}
                  >
                    <VideoSlide
                      short={short}
                      isActive={isActive && !isPaused}
                      isMuted={isMuted}
                      playbackRate={playbackRate}
                      onTimeUpdate={isActive ? trackView : undefined}
                      onTap={togglePlayPause}
                      onSeekStart={() => setIsTimelineSeeking(true)}
                      onSeekEnd={() => setIsTimelineSeeking(false)}
                      showPlayIndicator={isActive ? showPlayIndicator : null}
                      letterbox={!isMobile}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Desktop overlays — mute top-right on the video + feed-card style
              action bar evenly spread across the bottom (replaces the old left
              side panel of buttons). The wrapper is pointer-events-none and
              carries the bottom padding so the timeline seek bar at the very
              bottom stays reachable. */}
          {!isMobile && (
            <>
              <button
                onClick={() => setIsMuted(prev => !prev)}
                className="absolute top-3 right-3 z-10 w-10 h-10 bg-black/40 backdrop-blur-[24px] border border-white/10 hover:bg-black/60 rounded-xl flex items-center justify-center transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>

              <div className="absolute inset-x-0 bottom-0 z-10 pb-4 pointer-events-none">
                {/* Bottom gradient so the bar reads over bright video */}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                <div className="relative flex items-center justify-between px-4 pt-2 pointer-events-auto">
                  {/* Views */}
                  <div className="flex items-center gap-1">
                    <Eye className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{currentShort.views || '0'}</span>
                  </div>

                  {/* Tip */}
                  <button
                    onClick={() => setShowTipModal(true)}
                    className="flex items-center gap-1"
                    aria-label="Tip"
                  >
                    <Gem className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(tipCount)}</span>
                  </button>

                  {/* Dislike */}
                  <motion.button
                    onClick={() => handleVote(false)}
                    disabled={isVoting}
                    className="flex items-center gap-1"
                    animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    aria-label="Dislike"
                  >
                    <ThumbsDown className={cn(
                      "w-5 h-5 drop-shadow-lg",
                      isDisliked ? "fill-white text-white" : "text-white"
                    )} />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(localDislikeCount)}</span>
                  </motion.button>

                  {/* Share */}
                  <button
                    onClick={() => setShareSheetOpen(true)}
                    className="flex items-center gap-1"
                    aria-label="Share"
                  >
                    <Share2 className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(displayShareCount)}</span>
                  </button>

                  {/* Like — furthest right, like feed cards */}
                  <motion.button
                    onClick={() => handleVote(true)}
                    disabled={isVoting}
                    className="flex items-center gap-1"
                    animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    aria-label="Like"
                  >
                    <ThumbsUp className={cn(
                      "w-5 h-5 drop-shadow-lg",
                      isLiked ? "fill-white text-white" : "text-white"
                    )} />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(localLikeCount)}</span>
                  </motion.button>
                </div>
              </div>
            </>
          )}

          {/* Mobile-only overlays - TikTok-style layout */}
          {isMobile && (
            <>
              {/* Tap-to-restore zones - only active when overlays are hidden */}
              {overlaysHidden && (
                <div 
                  className="absolute inset-0 z-[25] pointer-events-none"
                >
              {/* Top zone - for swipe-up to restore overlays */}
                  <div 
                    className="absolute inset-x-0 top-0 h-[20%] pointer-events-auto"
                    onTouchStart={handleOverlayGestureTouchStart}
                    onTouchEnd={handleOverlayGestureTouchEnd}
                  />
                  {/* Bottom zone - only cover top portion, leave bottom 15% free for timeline seeker */}
                  <div 
                    className="absolute inset-x-0 bottom-[15%] h-[5%] pointer-events-auto"
                    onTouchStart={handleOverlayGestureTouchStart}
                    onTouchEnd={handleOverlayGestureTouchEnd}
                  />
                  {/* Right zone */}
                  <div 
                    className="absolute top-[20%] bottom-[20%] right-0 w-[20%] pointer-events-auto"
                    onTouchStart={handleOverlayGestureTouchStart}
                    onTouchEnd={handleOverlayGestureTouchEnd}
                  />
                </div>
              )}
              
              {/* Animated overlay container */}
              <motion.div
                className="absolute inset-0 z-10 pointer-events-none"
                animate={{ opacity: (overlaysHidden || showComments) ? 0 : 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {/* Bottom gradient overlay - fades from transparent to black */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                
                {/* Bottom overlay stack — creator info + description, with the
                    action bar below as the bottommost element (feed-card style
                    horizontal row instead of the old side rail). The wrapper is
                    pointer-events-none and carries the bottom padding, so the
                    strip under the action row stays free for the timeline seek. */}
                <div className="absolute inset-x-0 bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
                {/* Creator Info & Description */}
                <div
                  className={cn("px-4 pointer-events-auto", showComments && "pointer-events-none")}
                  onTouchStart={handleOverlayGestureTouchStart}
                  onTouchEnd={handleOverlayGestureTouchEnd}
                >
                  {/* Creator info row */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => handleNavigateToProfile()}
                      className="flex-shrink-0"
                    >
                      <Avatar className="w-12 h-12 rounded-xl" key={currentShort.avatar || currentShort.id}>
                        <AvatarImage src={currentShort.avatar} alt={currentShort.creatorUsername || currentShort.username} className="rounded-xl" />
                        <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">{(currentShort.creatorUsername || currentShort.username)[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </button>
                    <button
                      onClick={() => handleNavigateToProfile()}
                      className="flex flex-col items-start text-left min-w-0"
                    >
                      {currentShort.displayName && (
                        <span className="text-white font-semibold text-base drop-shadow-lg truncate leading-tight">{currentShort.displayName}</span>
                      )}
                      <span className="text-white/70 text-sm drop-shadow-lg truncate leading-tight">@{currentShort.creatorUsername || currentShort.username}</span>
                    </button>
                  </div>
                  
                  {/* Description - tap to expand/collapse */}
                  {currentShort.description && (
                    <button
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className="text-left w-full"
                    >
                      <div 
                        className={`overflow-y-auto scrollbar-hide transition-all duration-200 ${
                          isDescriptionExpanded ? 'max-h-[calc(2.5rem+200px)]' : 'max-h-[2.5rem]'
                        }`}
                      >
                        <p className={`text-white text-sm leading-relaxed drop-shadow-lg ${
                          isDescriptionExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                        }`}>
                          {currentShort.description}
                        </p>
                      </div>
                      {currentShort.description.length > 80 && (
                        <span className="text-white/60 text-xs mt-1">
                          {isDescriptionExpanded ? 'less' : 'more'}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Action bar — horizontal row evenly spread across the bottom,
                    matching the feed post card action bar (like at far right). */}
                <div
                  className={cn("mt-3 px-4 flex items-center justify-between pointer-events-auto", showComments && "pointer-events-none")}
                  onTouchStart={handleOverlayGestureTouchStart}
                  onTouchEnd={handleOverlayGestureTouchEnd}
                >
                  {/* Views */}
                  <div className="flex items-center gap-1">
                    <Eye className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{currentShort.views || '0'}</span>
                  </div>

                  {/* Tip */}
                  <button
                    onClick={() => setShowTipModal(true)}
                    className="flex items-center gap-1"
                    aria-label="Tip"
                  >
                    <Gem className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(tipCount)}</span>
                  </button>

                  {/* Dislike */}
                  <motion.button
                    onClick={() => handleVote(false)}
                    disabled={isVoting}
                    className="flex items-center gap-1"
                    animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    aria-label="Dislike"
                  >
                    <ThumbsDown className={cn(
                      "w-5 h-5 drop-shadow-lg",
                      isDisliked ? "fill-white text-white" : "text-white"
                    )} />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(localDislikeCount)}</span>
                  </motion.button>

                  {/* Share */}
                  <button
                    onClick={() => setShareSheetOpen(true)}
                    className="flex items-center gap-1"
                    aria-label="Share"
                  >
                    <Share2 className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(displayShareCount)}</span>
                  </button>

                  {/* Comments */}
                  <button
                    onClick={() => setShowComments(true)}
                    className="flex items-center gap-1"
                    aria-label="Comments"
                  >
                    <MessageSquare className="w-5 h-5 text-white drop-shadow-lg" />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(currentShort.comments || 0)}</span>
                  </button>

                  {/* Like — furthest right for easy thumb reach, like feed cards */}
                  <motion.button
                    onClick={() => handleVote(true)}
                    disabled={isVoting}
                    className="flex items-center gap-1"
                    animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    aria-label="Like"
                  >
                    <ThumbsUp className={cn(
                      "w-5 h-5 drop-shadow-lg",
                      isLiked ? "fill-white text-white" : "text-white"
                    )} />
                    <span className="text-xs font-medium text-white/70 drop-shadow-lg">{formatCount(localLikeCount)}</span>
                  </motion.button>
                </div>
                </div>
              </motion.div>
            </>
          )}
        </motion.div>

        {/* Mobile split comments panel - fills the bottom half when comments are
            open, with the shrunken video pinned above (Instagram-style). */}
        {isMobile && (
          <AnimatePresence>
            {showComments && currentShort?.id && (
              <motion.div
                key="mobile-comments-split"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: '58%', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SMOOTH_TRANSITION}
                className="w-full shrink-0 flex flex-col overflow-hidden bg-black/60 backdrop-blur-[24px] border-t border-white/[0.08] rounded-t-2xl z-30"
              >
                {/* Grab handle + close */}
                <div className="relative flex items-center justify-center pt-2.5 pb-1 flex-shrink-0">
                  <div className="h-1 w-10 rounded-full bg-white/25" />
                  <button
                    onClick={() => setShowComments(false)}
                    className="absolute right-3 top-1.5 w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/15 flex items-center justify-center transition-colors"
                    aria-label="Close comments"
                  >
                    <ChevronDown className="w-5 h-5 text-white/70" />
                  </button>
                </div>
                <div
                  className="flex-1 min-h-0 px-1 pb-[env(safe-area-inset-bottom)]"
                  style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
                >
                  <CommentsSection
                    tokenId={currentShort.id}
                    onClose={() => setShowComments(false)}
                    initialTab={commentsInitialTab}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Right Side Panel - Desktop Only: Creator info and comments */}
        {!isMobile && (
          <div className="w-[268px] lg:w-[320px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col">
            {/* Creator Info - Top */}
            <div className="bg-zinc-900/50 rounded-2xl p-3 lg:p-4 mb-3 relative">
              <div className="absolute top-3 right-3 lg:top-4 lg:right-4 flex items-center gap-1.5">
                <motion.button
                  onClick={toggleBookmark}
                  disabled={isBookmarkLoading}
                  className="w-8 h-8 bg-white/[0.08] hover:bg-white/15 rounded-lg flex items-center justify-center transition-colors"
                  animate={isBookmarked ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  aria-label="Bookmark"
                >
                  <Bookmark className={cn("w-4 h-4", isBookmarked ? "fill-yellow-500 text-yellow-500" : "text-white/60")} />
                </motion.button>
                <button
                  onClick={() => { navigate(`/app/post/${currentShort.id}/info`); onClose(); }}
                  className="w-8 h-8 bg-white/[0.08] hover:bg-white/15 rounded-lg flex items-center justify-center transition-colors"
                  aria-label="Post info"
                >
                  <Info className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <button
                onClick={() => handleNavigateToProfile()}
                className="flex items-center gap-2 lg:gap-3 w-full text-left pr-20"
              >
                <Avatar className="w-10 h-10 lg:w-12 lg:h-12 border-2 border-white/20 flex-shrink-0 rounded-xl" key={currentShort.avatar || currentShort.id}>
                  <AvatarImage src={currentShort.avatar} alt={currentShort.creatorUsername || currentShort.username} className="rounded-xl" />
                  <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">{(currentShort.creatorUsername || currentShort.username)[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col flex-1 min-w-0">
                  {currentShort.displayName && (
                    <span className="text-white font-semibold text-sm lg:text-base truncate hover:underline">{currentShort.displayName}</span>
                  )}
                  <span className="text-white/60 text-xs lg:text-sm truncate">@{currentShort.creatorUsername || currentShort.username}</span>
                </div>
              </button>
              {currentShort.description && (
                <ExpandableDescription text={currentShort.description} />
              )}
              {currentShort.creatorId && followCheckingCreators.has(currentShort.creatorId) ? (
                <div className="w-full mt-3 bg-white/10 backdrop-blur-sm text-white/40 text-xs lg:text-sm font-semibold px-4 py-2 rounded-xl border border-white/10 text-center animate-pulse">
                  Loading…
                </div>
              ) : (
                <button
                  onClick={handleFollow}
                  disabled={isCreatorFollowed(currentShort.creatorId)}
                  className="w-full mt-3 bg-white/10 backdrop-blur-sm text-white text-xs lg:text-sm font-semibold px-4 py-2 rounded-xl border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatorFollowed(currentShort.creatorId) ? 'Following ✓' : 'Follow'}
                </button>
              )}
            </div>

            {/* Desktop: Inline comments */}
            <div
              className="flex-1 bg-zinc-900/50 rounded-2xl p-3 lg:p-4 flex flex-col min-h-0 overflow-hidden"
              onWheelCapture={(e) => e.stopPropagation()}
            >
          <div className="flex-1 min-h-0 [&>div]:h-full [&>div]:min-h-0 [&>div]:max-h-none [&>div]:mt-0 [&>div]:p-0">
                <CommentsSection
                  tokenId={currentShort.id}
                  onClose={() => {}}
                  initialTab={commentsInitialTab}
              embedded
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile top header controls - TikTok style - animated with overlaysHidden */}
      {isMobile && (
        <motion.div
          className="pointer-events-auto"
          animate={{ opacity: (overlaysHidden || showComments) ? 0 : 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ pointerEvents: (overlaysHidden || showComments) ? 'none' : 'auto' }}
        >
          {/* Back button - top left */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 bg-zinc-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-20"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          
          {/* Right side controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
            {/* Playback speed */}
            <button
              onClick={() => {
                const currentIdx = PLAYBACK_RATES.indexOf(playbackRate as any);
                const nextRate = PLAYBACK_RATES[(currentIdx + 1) % PLAYBACK_RATES.length];
                setPlaybackRate(nextRate);
                vpSetPlaybackRate(nextRate);
              }}
              className="h-10 min-w-[40px] px-1.5 bg-zinc-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center"
              aria-label="Playback speed"
            >
              <span className="text-white text-[11px] font-bold leading-none">{formatRate(playbackRate)}x</span>
            </button>

            {/* Mute button */}
            <button
              onClick={() => setIsMuted(prev => !prev)}
              className="w-10 h-10 bg-zinc-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-white" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
            </button>
            
            {/* More options button */}
            <button
              onClick={() => setShareSheetOpen(true)}
              className="w-10 h-10 bg-zinc-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center"
            >
              <MoreHorizontal className="w-5 h-5 text-white" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Desktop close button */}
      {!isMobile && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center z-20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Options Drawer — mirrors the main-feed post card's three-dot menu. */}
      <Drawer open={shareSheetOpen} onOpenChange={setShareSheetOpen}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="relative pb-2">
            <DrawerTitle className="text-white text-lg">Options</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1">
            {/* Bookmark — moved here off the mobile bottom action row */}
            <button
              onClick={() => toggleBookmark()}
              disabled={isBookmarkLoading}
              className={cn(
                "flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50",
                isBookmarked ? "text-yellow-500" : "text-white"
              )}
            >
              <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
              {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            </button>
            <button
              onClick={() => { setShareSheetOpen(false); navigate(`/app/post/${currentShort.id}/info`); onClose(); }}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Info className="w-5 h-5" /> Post info
            </button>
            <button
              onClick={() => { setShareSheetOpen(false); setTimeout(() => setShowReportModal(true), 300); }}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Flag className="w-5 h-5" /> Report
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Link className="w-5 h-5" /> Copy Link
            </button>
            <button
              onClick={() => { setShareSheetOpen(false); setCommentsInitialTab('reposts'); setShowComments(true); }}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Repeat2 className="w-5 h-5" /> See Engagements
            </button>
            <button
              onClick={handleRepost}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Share2 className="w-5 h-5" /> Repost
            </button>
            <button
              onClick={handleQuote}
              className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
            >
              <Quote className="w-5 h-5" /> Quote
            </button>
            {!isOwnShort && currentShort?.creatorId && !isCreatorFollowed(currentShort.creatorId) && (
              <button
                onClick={handleFollow}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50"
              >
                <UserPlus className="w-5 h-5" />
                Follow
              </button>
            )}
            {!isOwnShort && currentShort?.creatorId && isCreatorFollowed(currentShort.creatorId) && (
              <button
                disabled
                className="flex items-center gap-3 px-4 py-3 text-zinc-500 rounded-xl text-left cursor-default"
              >
                <UserCheck className="w-5 h-5" /> Following
              </button>
            )}
            {!isOwnShort && (
              <button
                onClick={() => toast.info('Block coming soon')}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Ban className="w-5 h-5" /> Block Creator
              </button>
            )}
            {isOwnShort && (
              <>
                <div className="border-t border-white/10 my-1" />
                <button
                  onClick={async () => {
                    const next: TokenVisibility = visibility === 'public' ? 'private' : 'public';
                    try {
                      await updateTokenVisibility(currentShort.id, next);
                      setVisibility(next);
                      toast.success(`Post set to ${next}`);
                    } catch { toast.error('Failed to update visibility'); }
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  {visibility === 'public' ? <EyeOff className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                  {visibility === 'public' ? 'Make Private' : 'Make Public'}
                </button>
                <button
                  onClick={() => { setShareSheetOpen(false); setTimeout(() => setShowDeleteModal(true), 300); }}
                  className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Trash2 className="w-5 h-5" /> Delete
                </button>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Tip Modal */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        creatorAddress={currentShort?.creatorId || ''}
        creatorName={currentShort?.creatorUsername || currentShort?.username || ''}
        tokenId={currentShort?.id}
        context="post"
      />

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={currentShort?.id}
        contentType="video"
      />

      {/* Delete Modal — own shorts only */}
      <DeletePostModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        tokenId={currentShort?.id || ''}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          onClose();
        }}
      />
    </motion.div>
  );
}
