/**
 * Shorts Viewer Component
 * =======================
 * Full-screen shorts viewer with video playback and comments.
 * Uses the same ActionBar and CommentsSheet as regular posts.
 * Desktop: Centered portrait video with side panels.
 * Mobile: Full-screen video.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, ChevronUp, ChevronDown, Play, Pause, Eye, ThumbsUp, ThumbsDown, MessageSquare, Bookmark, Share2, Send } from 'lucide-react';
import { motion, PanInfo } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { voteOnNFT, getNFTComments, postComment, type ApiCommentResponse } from '@/lib/api/dehub';
import { toast } from 'sonner';
import { CommentsSection } from './CommentsSection';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Repeat2, Quote, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShortVideo } from '@/types/feed.types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';

interface ShortsViewerProps {
  shorts: ShortVideo[];
  initialIndex: number;
  onClose: () => void;
}

/** Format count for display (e.g., 1500 -> 1.5K) */
function formatCount(count?: number | string): string {
  // Handle string counts like "1.2K"
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

export function ShortsViewer({ shorts, initialIndex, onClose }: ShortsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showPlayIndicator, setShowPlayIndicator] = useState<'play' | 'pause' | null>(null);
  const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [showComments, setShowComments] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [inlineCommentText, setInlineCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  
  // Voting state - synced with API
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(0);
  const [localDislikeCount, setLocalDislikeCount] = useState(0);
  const [isVoting, setIsVoting] = useState(false);
  const [justVoted, setJustVoted] = useState<'like' | 'dislike' | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const currentShort = shorts[currentIndex];
  
  // Navigate to creator profile
  const handleNavigateToProfile = useCallback(() => {
    const username = currentShort?.creatorUsername || currentShort?.username;
    if (username) {
      onClose();
      navigate(`/${username}`);
    }
  }, [currentShort?.creatorUsername, currentShort?.username, navigate, onClose]);
  
  // Bookmark hook - uses the same system as regular posts
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(currentShort?.id || '');
  
  // View tracking for the current short
  const { onTimeUpdate: trackView } = useVideoViewTracking(currentShort?.id);
  
  const queryClient = useQueryClient();
  
  // Fetch inline comments for desktop/tablet
  const { data: inlineComments = [] } = useQuery({
    queryKey: ['shorts-inline-comments', currentShort?.id],
    queryFn: async () => {
      if (!currentShort?.id) return [];
      const response = await getNFTComments(currentShort.id, 0, 50);
      return response.map(mapApiCommentToInline);
    },
    enabled: !!currentShort?.id && !isMobile,
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
  
  // Reset voting state when changing videos
  useEffect(() => {
    setIsLiked(false);
    setIsDisliked(false);
    // Parse likes from string if needed
    const likes = typeof currentShort?.likes === 'string' 
      ? parseInt(currentShort.likes.replace(/[^0-9]/g, '')) || 0 
      : (currentShort?.likes as unknown as number) || 0;
    setLocalLikeCount(likes);
    setLocalDislikeCount(0);
    setShowComments(false);
    setInlineCommentText('');
  }, [currentIndex, currentShort?.likes]);
  
  // Handle voting - same logic as ActionBar
  const handleVote = useCallback(async (vote: boolean) => {
    if (!currentShort?.id || isVoting || isLiked || isDisliked) return;
    
    if (!isAuthenticated) {
      toast.error('Please connect your wallet to vote');
      return;
    }

    setIsVoting(true);
    
    // Optimistic update with animation trigger
    if (vote) {
      setIsLiked(true);
      setLocalLikeCount(prev => prev + 1);
      setJustVoted('like');
    } else {
      setIsDisliked(true);
      setLocalDislikeCount(prev => prev + 1);
      setJustVoted('dislike');
    }
    
    setTimeout(() => setJustVoted(null), 400);

    try {
      await voteOnNFT(currentShort.id, vote);
    } catch (error: unknown) {
      // Revert optimistic update on error
      if (vote) {
        setIsLiked(false);
        setLocalLikeCount(prev => prev - 1);
      } else {
        setIsDisliked(false);
        setLocalDislikeCount(prev => prev - 1);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('409') || errorMessage.includes('already')) {
        toast.error('You have already voted on this content');
        if (vote) setIsLiked(true);
        else setIsDisliked(true);
      } else {
        toast.error('Failed to vote. Please try again.');
      }
    } finally {
      setIsVoting(false);
    }
  }, [currentShort?.id, isVoting, isLiked, isDisliked, isAuthenticated]);

  const hasVoted = isLiked || isDisliked;
  
  // Handle video time update for view tracking
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const ct = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      if (dur > 0) {
        trackView(ct, dur);
      }
    }
  }, [trackView]);

  // Lock body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, []);

  useEffect(() => {
    // Reset aspect ratio state when changing videos
    setVideoAspect('portrait');
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(true);
  }, [currentIndex]);

  // Handle video metadata load to detect aspect ratio
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoWidth && videoHeight) {
        const ratio = videoWidth / videoHeight;
        if (ratio > 1.1) {
          setVideoAspect('landscape');
        } else if (ratio < 0.9) {
          setVideoAspect('portrait');
        } else {
          setVideoAspect('square');
        }
      }
    }
  }, []);

  const goToNext = () => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Handle mouse wheel scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      if (isScrolling) return;
      
      const threshold = 50;
      if (Math.abs(e.deltaY) < threshold) return;

      setIsScrolling(true);
      
      if (e.deltaY > 0) {
        goToNext();
      } else {
        goToPrev();
      }

      // Debounce to prevent rapid scrolling
      setTimeout(() => setIsScrolling(false), 500);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [currentIndex, isScrolling]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goToNext();
      else if (e.key === 'ArrowUp' || e.key === 'k') goToPrev();
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'm') toggleMute();
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isPlaying]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Vertical swipe for navigation only - removed horizontal swipe to close
    if (info.offset.y < -100) goToNext();
    else if (info.offset.y > 100) goToPrev();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowPlayIndicator('pause');
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      setShowPlayIndicator('play');
    }
    
    setTimeout(() => setShowPlayIndicator(null), 500);
  };

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

  const handleCopyLink = () => {
    const url = `${window.location.origin}/app/post/${currentShort.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Post URL copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleRepost = () => {
    toast.success('Reposted!');
    setShareSheetOpen(false);
  };

  const handleQuote = () => {
    toast.success('Quote created!');
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
      className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Layout with Side Panels */}
      <div className={`relative flex items-center justify-center h-full ${isMobile ? 'w-full' : 'gap-4 px-4'}`}>
        
        {/* Left Side Panel - Desktop/iPad Only: Action buttons */}
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

            {/* Action buttons - synced with API */}
            <div className="flex flex-col items-center gap-4">
              <ActionButton
                icon={ThumbsUp}
                count={localLikeCount}
                onClick={() => handleVote(true)}
                active={isLiked}
                activeColor="text-white"
                disabled={hasVoted || isVoting}
                animate={justVoted === 'like'}
              />
              
              <ActionButton
                icon={ThumbsDown}
                count={localDislikeCount}
                onClick={() => handleVote(false)}
                active={isDisliked}
                activeColor="text-white"
                disabled={hasVoted || isVoting}
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
                onClick={toggleMute}
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

        {/* Video Container */}
        <div className={`relative ${isMobile ? 'w-full h-full bg-black' : 'w-[360px] h-[calc(100vh-80px)] max-h-[640px] bg-zinc-900'} rounded-none md:rounded-2xl overflow-hidden`}>
          {/* Liquid glass background for non-portrait videos */}
          {videoAspect !== 'portrait' && currentShort.thumbnail && (
            <>
              {/* Blurred thumbnail background */}
              <div 
                className="absolute inset-0 z-0"
                style={{
                  backgroundImage: `url(${currentShort.thumbnail})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(40px) saturate(150%)',
                  transform: 'scale(1.1)',
                }}
              />
              {/* Liquid glass overlay */}
              <div className="absolute inset-0 z-[1] bg-black/40 backdrop-blur-[24px] saturate-[180%]" />
            </>
          )}
          
          <motion.div
            className="absolute inset-0 z-[2]"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            onTap={togglePlayPause}
          >
            {currentShort.videoUrl ? (
              <video
                ref={videoRef}
                src={currentShort.videoUrl}
                className={`w-full h-full ${videoAspect === 'portrait' ? 'object-cover' : 'object-contain'}`}
                loop
                playsInline
                autoPlay
                muted={isMuted}
                poster={currentShort.thumbnail}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => console.error('Video load error:', currentShort.videoUrl)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                <img 
                  src={currentShort.thumbnail} 
                  alt={currentShort.description || 'Short video'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <p className="text-white/70">Video unavailable</p>
                </div>
              </div>
            )}
            
            {/* Play/Pause indicator */}
            {showPlayIndicator && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center"
                >
                  {showPlayIndicator === 'play' ? (
                    <Play className="w-8 h-8 text-white fill-white" />
                  ) : (
                    <Pause className="w-8 h-8 text-white" />
                  )}
                </motion.div>
              </div>
            )}
          </motion.div>

          {/* Mobile-only overlays */}
          {isMobile && (
            <>
              {/* Creator Info */}
              <div className="absolute top-4 left-4 z-10 max-w-[50vw]">
                <div className="flex items-center gap-2 bg-zinc-800/70 backdrop-blur-sm rounded-xl pl-1 pr-3 py-1">
                  <button
                    onClick={() => handleNavigateToProfile()}
                    className="flex items-center gap-2 min-w-0 flex-1"
                  >
                    <Avatar className="w-8 h-8 flex-shrink-0 rounded-xl" key={currentShort.avatar || currentShort.id}>
                      <AvatarImage src={currentShort.avatar} alt={currentShort.creatorUsername || currentShort.username} className="rounded-xl" />
                      <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">{(currentShort.creatorUsername || currentShort.username)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-white text-sm font-medium truncate min-w-0 flex-1">@{currentShort.creatorUsername || currentShort.username}</span>
                  </button>
                  <button className="ml-2 bg-white text-black text-xs font-semibold px-3 py-1 rounded-xl flex-shrink-0">
                    Follow
                  </button>
                </div>
              </div>

              {/* Mobile Action Bar at Bottom */}
              <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
                <div className="flex items-center justify-between">
                  {/* Like/Dislike */}
                  <div className="flex items-center gap-3">
                    <motion.button
                      onClick={() => handleVote(true)}
                      disabled={hasVoted || isVoting}
                      className={cn(
                        "flex items-center gap-1 transition-colors",
                        hasVoted && !isLiked && "opacity-50"
                      )}
                      animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      <div className={cn(
                        "w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-xl flex items-center justify-center",
                        isLiked && "text-white"
                      )}>
                        <ThumbsUp className={cn("w-5 h-5", isLiked ? "fill-current text-white" : "text-white")} />
                      </div>
                      <span className="text-white text-xs">{formatCount(localLikeCount)}</span>
                    </motion.button>
                    
                    <motion.button
                      onClick={() => handleVote(false)}
                      disabled={hasVoted || isVoting}
                      className={cn(
                        "flex items-center gap-1 transition-colors",
                        hasVoted && !isDisliked && "opacity-50"
                      )}
                      animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      <div className={cn(
                        "w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-xl flex items-center justify-center"
                      )}>
                        <ThumbsDown className={cn("w-5 h-5", isDisliked ? "fill-current text-white" : "text-white")} />
                      </div>
                    </motion.button>
                  </div>
                  
                  {/* Comments */}
                  <button
                    onClick={() => setShowComments(true)}
                    className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-xl flex items-center justify-center"
                  >
                    <MessageSquare className="w-5 h-5 text-white" />
                  </button>
                  
                  {/* Share */}
                  <button
                    onClick={() => setShareSheetOpen(true)}
                    className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-xl flex items-center justify-center"
                  >
                    <Share2 className="w-5 h-5 text-white" />
                  </button>
                  
                  {/* Bookmark */}
                  <motion.button
                    onClick={toggleBookmark}
                    disabled={isBookmarkLoading}
                    className={cn(
                      "w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-xl flex items-center justify-center",
                      isBookmarkLoading && "opacity-50"
                    )}
                    animate={isBookmarked ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <Bookmark className={cn("w-5 h-5", isBookmarked ? "fill-current text-yellow-500" : "text-white")} />
                  </motion.button>
                </div>
                
                {/* Mobile Comments Preview - tap to expand */}
                <button
                  onClick={() => setShowComments(true)}
                  className="mt-3 w-full bg-zinc-900/60 backdrop-blur-sm rounded-xl p-3 text-left"
                >
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <MessageSquare className="w-4 h-4" />
                    <span>Tap to view comments</span>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Side Panel - Desktop/iPad Only: Creator info and comments */}
        {!isMobile && (
          <div className="w-[268px] lg:w-[320px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col">
            {/* Creator Info - Top */}
            <div className="bg-zinc-900/50 rounded-2xl p-3 lg:p-4 mb-3">
              <div className="flex items-center gap-2 lg:gap-3">
                <button
                  onClick={() => handleNavigateToProfile()}
                  className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1 text-left"
                >
                  <Avatar className="w-10 h-10 lg:w-12 lg:h-12 border-2 border-white/20 flex-shrink-0 rounded-xl" key={currentShort.avatar || currentShort.id}>
                    <AvatarImage src={currentShort.avatar} alt={currentShort.creatorUsername || currentShort.username} className="rounded-xl" />
                    <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">{(currentShort.creatorUsername || currentShort.username)[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm lg:text-base truncate hover:underline">@{currentShort.creatorUsername || currentShort.username}</p>
                    <div className="flex items-center gap-2 text-white/60 text-xs lg:text-sm">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {currentShort.views || '0'}
                      </span>
                      <span>•</span>
                      <span>{formatCount(localLikeCount)} likes</span>
                    </div>
                  </div>
                </button>
                <button className="bg-white text-black text-xs lg:text-sm font-semibold px-3 lg:px-4 py-1 lg:py-1.5 rounded-xl hover:bg-white/90 transition-colors flex-shrink-0 max-w-[80px]">
                  Follow
                </button>
              </div>
              {currentShort.description && (
                <p className="text-white/80 text-xs lg:text-sm mt-2 lg:mt-3 line-clamp-2">{currentShort.description}</p>
              )}
            </div>

            {/* Desktop: Inline comments */}
            <div className="flex-1 bg-zinc-900/50 rounded-2xl p-3 lg:p-4 flex flex-col min-h-0">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-3 flex-shrink-0">
                <MessageSquare className="w-4 h-4" />
                <span>{inlineComments.length} Comments</span>
              </div>
              
              {/* Comments list */}
              <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3 min-h-0">
                {inlineComments.length === 0 ? (
                  <p className="text-white/40 text-sm text-center py-4">No comments yet</p>
                ) : (
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
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10 flex-shrink-0">
                <input
                  type="text"
                  value={inlineCommentText}
                  onChange={(e) => setInlineCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePostInlineComment();
                    }
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 bg-transparent text-white text-xs placeholder:text-white/40 outline-none"
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

      {/* Close button - always visible */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 lg:w-10 lg:h-10 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center z-20 transition-colors"
      >
        <X className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
      </button>

      {/* Mobile header controls */}
      {isMobile && (
        <button
          onClick={toggleMute}
          className="absolute top-4 right-16 w-8 h-8 bg-zinc-800/80 rounded-xl flex items-center justify-center z-20"
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-white" />
          ) : (
            <Volume2 className="w-4 h-4 text-white" />
          )}
        </button>
      )}


      {/* Share Drawer - same style as ActionBar */}
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

      {/* Comments Section - same component as regular posts */}
      {showComments && currentShort?.id && (
        <CommentsSection
          tokenId={currentShort.id}
          onClose={() => setShowComments(false)}
        />
      )}
    </motion.div>
  );
}
