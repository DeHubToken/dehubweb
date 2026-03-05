/**
 * Shorts Viewer Component
 * =======================
 * Full-screen shorts viewer with TikTok-style vertical carousel.
 * Renders 3 videos (prev/current/next) for smooth transitions.
 * Uses Framer Motion for smooth translateY animations.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, ChevronUp, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare, Bookmark, Share2, Send, ChevronLeft, MoreHorizontal, Eye } from 'lucide-react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { voteOnPost, getNFTComments, postComment, followUser, type ApiCommentResponse } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { CommentsWrapper } from './CommentsWrapper';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Repeat2, Quote, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShortVideo } from '@/types/feed.types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import { VideoSlide } from './VideoSlide';
import { setVoteCache, getVoteCache } from '@/lib/vote-cache';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';

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
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [inlineCommentText, setInlineCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [overlaysHidden, setOverlaysHidden] = useState(false);
  const [isTimelineSeeking, setIsTimelineSeeking] = useState(false);
  
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
  
  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [followedCreators, setFollowedCreators] = useState<Set<string>>(new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();

  const currentShort = shorts[currentIndex];
  
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
  
  // Handle follow creator
  const handleFollow = useCallback(async () => {
    const creatorAddress = currentShort?.creatorId;
    if (!creatorAddress) {
      toast.error('Unable to follow - creator not found');
      return;
    }
    
    if (!isAuthenticated) {
      toast.error('Please log in to follow');
      return;
    }
    
    if (isFollowLoading || followedCreators.has(creatorAddress)) {
      return;
    }
    
    setIsFollowLoading(true);
    try {
      await followUser(creatorAddress);
      setFollowedCreators(prev => new Set(prev).add(creatorAddress));
      toast.success(`Following ${currentShort.displayName || currentShort.creatorUsername || currentShort.username}!`);
    } catch (error: unknown) {
      console.error('Failed to follow:', error);
      // Check if error indicates already following
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('following')) {
        toast.info(`You're already following ${currentShort.displayName || currentShort.creatorUsername || 'this user'}`);
        // Mark as followed to update UI
        setFollowedCreators(prev => new Set(prev).add(creatorAddress));
      } else {
        toast.error('Failed to follow user');
      }
    } finally {
      setIsFollowLoading(false);
    }
  }, [currentShort, isAuthenticated, isFollowLoading, followedCreators]);
  
  // Bookmark hook
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(currentShort?.id || '');
  
  const queryClient = useQueryClient();
  
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
      toast.error('Please log in to comment');
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
    setInlineCommentText('');
    setIsDescriptionExpanded(false);
    setIsPaused(false);
  }, [currentIndex, currentShort?.id, currentShort?.likes, currentShort?.isLiked, currentShort?.isDisliked]);
  
  // Handle voting
  const handleVote = useCallback(async (vote: boolean) => {
    const tokenId = String(currentShort?.id);
    
    if (!tokenId || tokenId === 'undefined' || isVoting) return;
    
    if (!isAuthenticated) {
      toast.error('Log in to engage');
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

  // Lock body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
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
    setShareSheetOpen(false);
  };

  const handleRepost = async () => {
    if (!walletAddress) { setShareSheetOpen(false); return; }
    const id = currentShort?.id;
    if (!id) return;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return;
    try {
      const { repostPost } = await import('@/lib/api/dehub');
      await repostPost(numericId);
      toast.success('Reposted!');
    } catch {
      toast.error('Failed to repost');
    }
    setShareSheetOpen(false);
  };

  const handleQuote = () => {
    toast.info('Quote for shorts coming soon!');
    setShareSheetOpen(false);
  };

  // Action button component for consistency
  const ActionButton = ({ 
    icon: Icon, 
    count, 
    onClick, 
    active, 
    activeColor = 'text-red-500',
    disabled,
    animate
  }: { 
    icon: typeof ThumbsUp; 
    count?: string | number; 
    onClick?: () => void;
    active?: boolean;
    activeColor?: string;
    disabled?: boolean;
    animate?: boolean;
  }) => (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      animate={animate ? { scale: [1, 1.3, 1] } : {}}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className={cn(
        "w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center transition-colors",
        active && activeColor
      )}>
        <Icon className={cn("w-6 h-6", active ? activeColor : "text-white", active && "fill-current")} />
      </div>
      {count !== undefined && <span className="text-white text-xs">{formatCount(count)}</span>}
    </motion.button>
  );

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("fixed inset-0 z-[60] flex items-center justify-center", isMobile ? "bg-black" : "bg-black/60 backdrop-blur-[24px]")}
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Layout with Side Panels */}
      <div className={`relative flex items-center justify-center h-full ${isMobile ? 'w-full' : 'gap-4 px-4'}`}>
        
        {/* Left Side Panel - Desktop Only: Action buttons */}
        {!isMobile && (
          <div className="w-[80px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col items-center justify-center gap-6">
            {/* Navigation */}
            <button
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </button>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-4">
              <ActionButton
                icon={ThumbsUp}
                count={localLikeCount}
                onClick={() => handleVote(true)}
                active={isLiked}
                activeColor="text-white"
                disabled={isVoting}
                animate={justVoted === 'like'}
              />
              
              <ActionButton
                icon={ThumbsDown}
                count={localDislikeCount}
                onClick={() => handleVote(false)}
                active={isDisliked}
                activeColor="text-white"
                disabled={isVoting}
                animate={justVoted === 'dislike'}
              />

              {/* View count */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 bg-zinc-800/80 rounded-xl flex items-center justify-center">
                  <Eye className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs">{currentShort.views || '0'}</span>
              </div>

              <ActionButton
                icon={Share2}
                onClick={() => setShareSheetOpen(true)}
              />
              
              <ActionButton
                icon={Bookmark}
                onClick={toggleBookmark}
                active={isBookmarked}
                activeColor="text-yellow-500"
                disabled={isBookmarkLoading}
                animate={isBookmarked}
              />

              <button
                onClick={() => setIsMuted(prev => !prev)}
                className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-6 h-6 text-white" />
                ) : (
                  <Volume2 className="w-6 h-6 text-white" />
                )}
              </button>
            </div>

            <button
              onClick={goToNext}
              disabled={currentIndex === shorts.length - 1}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>
          </div>
        )}

        {/* Video Container - Vertical Carousel Stack */}
        <div className={`relative ${isMobile ? 'w-full h-full bg-black' : 'w-[360px] h-[calc(100vh-80px)] max-h-[640px] bg-zinc-900'} rounded-none md:rounded-2xl overflow-hidden`}>
          
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
                      onTimeUpdate={isActive ? trackView : undefined}
                      onTap={togglePlayPause}
                      onSeekStart={() => setIsTimelineSeeking(true)}
                      onSeekEnd={() => setIsTimelineSeeking(false)}
                      showPlayIndicator={isActive ? showPlayIndicator : null}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

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
                animate={{ opacity: overlaysHidden ? 0 : 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {/* Bottom gradient overlay - fades from transparent to black */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                
                {/* Bottom Left - Creator Info & Description */}
                <div 
                  className="absolute bottom-6 left-4 right-20 pointer-events-auto"
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
                      className="flex items-center gap-1.5 min-w-0"
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

                {/* Right Side Action Buttons - Vertical stack */}
                <div 
                  className="absolute right-3 bottom-8 flex flex-col items-center gap-5 pointer-events-auto"
                  onTouchStart={handleOverlayGestureTouchStart}
                  onTouchEnd={handleOverlayGestureTouchEnd}
                >
                  {/* Like */}
                  <motion.button
                    onClick={() => handleVote(true)}
                    disabled={isVoting}
                    className="flex flex-col items-center gap-1"
                    animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <ThumbsUp className={cn(
                      "w-8 h-8 drop-shadow-lg",
                      isLiked ? "fill-white text-white" : "text-white"
                    )} />
                    <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(localLikeCount)}</span>
                  </motion.button>
                  
                  {/* Dislike */}
                  <motion.button
                    onClick={() => handleVote(false)}
                    disabled={isVoting}
                    className="flex flex-col items-center gap-1"
                    animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <ThumbsDown className={cn(
                      "w-8 h-8 drop-shadow-lg",
                      isDisliked ? "fill-white text-white" : "text-white"
                    )} />
                    <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(localDislikeCount)}</span>
                  </motion.button>

                  {/* Comments */}
                  <button
                    onClick={() => setShowComments(true)}
                    className="flex flex-col items-center gap-1"
                  >
                    <MessageSquare className="w-8 h-8 text-white drop-shadow-lg" />
                    <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(currentShort.comments || 0)}</span>
                  </button>
                  
                  {/* Views */}
                  <div className="flex flex-col items-center gap-1">
                    <Eye className="w-8 h-8 text-white drop-shadow-lg" />
                    <span className="text-white text-xs font-medium drop-shadow-lg">{currentShort.views || '0'}</span>
                  </div>
                  
                  {/* Bookmark */}
                  <motion.button
                    onClick={toggleBookmark}
                    disabled={isBookmarkLoading}
                    className="flex flex-col items-center gap-1"
                    animate={isBookmarked ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <Bookmark className={cn(
                      "w-8 h-8 drop-shadow-lg",
                      isBookmarked ? "fill-white text-white" : "text-white"
                    )} />
                  </motion.button>
                  
                  {/* Share */}
                  <button
                    onClick={() => setShareSheetOpen(true)}
                    className="flex flex-col items-center gap-1"
                  >
                    <Share2 className="w-8 h-8 drop-shadow-lg" />
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </div>

        {/* Right Side Panel - Desktop Only: Creator info and comments */}
        {!isMobile && (
          <div className="w-[268px] lg:w-[320px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col">
            {/* Creator Info - Top */}
            <div className="bg-zinc-900/50 rounded-2xl p-3 lg:p-4 mb-3">
              <button
                onClick={() => handleNavigateToProfile()}
                className="flex items-center gap-2 lg:gap-3 w-full text-left"
              >
                <Avatar className="w-10 h-10 lg:w-12 lg:h-12 border-2 border-white/20 flex-shrink-0 rounded-xl" key={currentShort.avatar || currentShort.id}>
                  <AvatarImage src={currentShort.avatar} alt={currentShort.creatorUsername || currentShort.username} className="rounded-xl" />
                  <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">{(currentShort.creatorUsername || currentShort.username)[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {currentShort.displayName && (
                    <span className="text-white font-semibold text-sm lg:text-base truncate hover:underline">{currentShort.displayName}</span>
                  )}
                  <span className="text-white/60 text-xs lg:text-sm truncate">@{currentShort.creatorUsername || currentShort.username}</span>
                </div>
              </button>
              {currentShort.description && (
                <p className="text-white/80 text-xs lg:text-sm mt-2 lg:mt-3 line-clamp-2">{currentShort.description}</p>
              )}
              <button 
                onClick={handleFollow}
                disabled={isFollowLoading || (currentShort.creatorId ? followedCreators.has(currentShort.creatorId) : false)}
                className="w-full mt-3 bg-white/10 backdrop-blur-sm text-white text-xs lg:text-sm font-semibold px-4 py-2 rounded-xl border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFollowLoading ? 'Following...' : (currentShort.creatorId && followedCreators.has(currentShort.creatorId)) ? 'Following' : 'Follow'}
              </button>
            </div>

            {/* Desktop: Inline comments */}
            <div className="flex-1 bg-zinc-900/50 rounded-2xl p-3 lg:p-4 flex flex-col min-h-0">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-3 flex-shrink-0">
                <MessageSquare className="w-4 h-4" />
                <span>{inlineComments.length} Comments</span>
              </div>
              
              {/* Comments list */}
              <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3 min-h-0">
                {inlineComments.length > 0 && (
                  inlineComments.slice(0, 10).map((comment) => (
                    <div key={comment.id} className="flex gap-2">
                      <Avatar className="w-6 h-6 flex-shrink-0 rounded-lg">
                        {comment.avatar && <AvatarImage src={comment.avatar} className="rounded-lg" />}
                        <AvatarFallback className="bg-zinc-700 text-white text-xs rounded-lg">
                          {comment.username?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white text-xs font-medium truncate">{comment.username}</span>
                          <span className="text-white/40 text-[10px]">{comment.timeAgo}</span>
                        </div>
                        <p className="text-white/70 text-xs leading-relaxed line-clamp-2">{comment.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Comment input */}
              <div className="relative flex items-center gap-2 mt-3 flex-shrink-0">
                <input
                  ref={inlineCommentRef}
                  type="text"
                  value={inlineCommentText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInlineCommentText(val);
                    mention.handleInput(val, e.target.selectionStart ?? val.length);
                  }}
                  onKeyDown={(e) => {
                    if (mention.isOpen) {
                      const handled = mention.handleKeyDown(e);
                      if (handled) {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault();
                          const liveResults = (window as any).__mentionResults || [];
                          if (liveResults[mention.selectedIndex]) {
                            mention.handleSelect(liveResults[mention.selectedIndex]);
                          }
                        }
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePostInlineComment();
                    }
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 bg-transparent text-white text-xs placeholder:text-white/40 outline-none"
                />
                <UserMentionDropdown
                  query={mention.query}
                  isOpen={mention.isOpen}
                  position={mention.position}
                  selectedIndex={mention.selectedIndex}
                  onSelectedIndexChange={mention.setSelectedIndex}
                  onSelect={mention.handleSelect}
                  onClose={mention.handleClose}
                />
                <button
                  onClick={handlePostInlineComment}
                  disabled={!inlineCommentText.trim() || isPostingComment}
                  className="text-white/60 hover:text-white disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile top header controls - TikTok style - animated with overlaysHidden */}
      {isMobile && (
        <motion.div
          className="pointer-events-auto"
          animate={{ opacity: overlaysHidden ? 0 : 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ pointerEvents: overlaysHidden ? 'none' : 'auto' }}
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

      {/* Share Drawer */}
      <Drawer open={shareSheetOpen} onOpenChange={setShareSheetOpen}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="relative">
            <DrawerTitle className="text-white/90 font-semibold">Share</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 mt-2 relative">
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
          </div>
        </DrawerContent>
      </Drawer>

      {/* Comments */}
      {currentShort?.id && (
        <CommentsWrapper
          open={showComments}
          onOpenChange={setShowComments}
          tokenId={currentShort.id}
        />
      )}
    </motion.div>
  );
}
