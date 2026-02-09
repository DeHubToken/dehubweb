/**
 * Story Viewer Modal
 * ==================
 * TikTok-style full-screen vertical carousel viewer for stories.
 * Renders 3 stories (prev/current/next) for smooth transitions.
 * Matches ShortsViewer UI exactly with left action panel on desktop.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, ChevronLeft, ChevronUp, ChevronDown, MoreHorizontal, ThumbsUp, ThumbsDown, Share2, Trash2, Loader2, MessageSquare, Eye, Bookmark, Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Repeat2, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Story } from '@/hooks/use-stories';
import { buildAvatarUrl } from '@/lib/media-url';
import { useIsMobile } from '@/hooks/use-mobile';
import { useStoryReactions } from '@/hooks/use-story-reactions';
import { useStoryViews } from '@/hooks/use-story-views';
import { useStoryComments } from '@/hooks/use-story-comments';
import { StorySlide } from './StorySlide';
import { StoryCommentsDrawer } from './StoryCommentsDrawer';

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stories: Story[];
  initialIndex?: number;
  /** Called when a story becomes the active/viewed story */
  onStoryWatched?: (storyId: string) => void;
  /** Called when user scrolls past the last story - use to transition to shorts */
  onSwitchToShorts?: () => void;
}

// Smooth tween transition - eliminates spring overshoot for buttery landing
const SMOOTH_TRANSITION = {
  type: 'tween',
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1],
} as const;

/** Format count for display */
function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toString();
}

export function StoryViewerModal({ isOpen, onClose, stories, initialIndex = 0, onStoryWatched, onSwitchToShorts }: StoryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [justVoted, setJustVoted] = useState<'like' | 'dislike' | null>(null);
  const [inlineCommentText, setInlineCommentText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const currentStory = stories[currentIndex];
  const isOwnStory = currentStory && walletAddress?.toLowerCase() === currentStory.wallet_address.toLowerCase();

  // Story reactions hook
  const { likes, dislikes, isLiked, isDisliked, isReacting, react } = useStoryReactions(currentStory?.id);

  // Story views hook
  const { viewCount, recordView } = useStoryViews(currentStory?.id);

  // Story comments hook
  const { comments: inlineComments, commentCount, postComment: addStoryComment, isPosting: isPostingComment } = useStoryComments(currentStory?.id);

  // Record view and mark as watched when story becomes active
  useEffect(() => {
    if (isOpen && currentStory?.id) {
      recordView();
      onStoryWatched?.(currentStory.id);
    }
    // recordView is stable (ref-based) — only re-run on story change or modal open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStory?.id]);

  // Resolve avatar URL — local asset paths (starting with /) must pass through as-is
  const resolvedAvatar = useMemo(() => {
    if (!currentStory?.avatar) return undefined;
    if (currentStory.avatar.startsWith('http') || currentStory.avatar.startsWith('/')) {
      return currentStory.avatar;
    }
    return buildAvatarUrl(currentStory.wallet_address, currentStory.avatar) || undefined;
  }, [currentStory]);

  // Compute visible indices for the 3-story window
  const visibleIndices = useMemo(() => {
    return [
      currentIndex - 1,
      currentIndex,
      currentIndex + 1,
    ].filter(i => i >= 0 && i < stories.length);
  }, [currentIndex, stories.length]);

  // Reset to initialIndex when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setDragOffset(0);
      setShowComments(false);
      setInlineCommentText('');
    }
  }, [isOpen, initialIndex]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
      };
    }
  }, [isOpen]);

  const goNext = useCallback(() => {
    if (isTransitioning) return;
    
    if (currentIndex < stories.length - 1) {
      setIsTransitioning(true);
      setCurrentIndex((prev) => prev + 1);
      setTimeout(() => setIsTransitioning(false), 350);
    } else if (onSwitchToShorts) {
      onSwitchToShorts();
    } else {
      setIsTransitioning(true);
      const randomIndex = Math.floor(Math.random() * stories.length);
      setCurrentIndex(randomIndex);
      setTimeout(() => setIsTransitioning(false), 350);
    }
  }, [currentIndex, stories.length, isTransitioning, onSwitchToShorts]);

  const goPrev = useCallback(() => {
    if (isTransitioning) return;
    
    if (currentIndex > 0) {
      setIsTransitioning(true);
      setCurrentIndex((prev) => prev - 1);
      setTimeout(() => setIsTransitioning(false), 350);
    }
  }, [currentIndex, isTransitioning]);

  // Mouse wheel handler
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isTransitioning) return;
      if (Math.abs(e.deltaY) < 50) return;

      if (e.deltaY > 0) {
        goNext();
      } else {
        goPrev();
      }
    };

    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [isOpen, isTransitioning, goNext, goPrev]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'm':
          setIsMuted(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goNext, goPrev, onClose]);

  const handleDrag = useCallback((_: any, info: PanInfo) => {
    setDragOffset(info.offset.y);
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setDragOffset(0);
    
    if (isTransitioning) return;
    
    const swipeThreshold = 80;
    const velocityThreshold = 300;
    
    if (info.offset.y < -swipeThreshold || info.velocity.y < -velocityThreshold) {
      goNext();
    } else if (info.offset.y > swipeThreshold || info.velocity.y > velocityThreshold) {
      goPrev();
    }
  }, [goNext, goPrev, isTransitioning]);

  const handleDelete = async () => {
    if (!currentStory || !isOwnStory || !walletAddress) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', currentStory.id)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['stories'] });
      toast.success('Story deleted');

      if (stories.length === 1) {
        onClose();
      } else if (currentIndex >= stories.length - 1) {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete story:', error);
      toast.error('Failed to delete story');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleVote = useCallback((type: 'like' | 'dislike') => {
    react(type);
    setJustVoted(type);
    setTimeout(() => setJustVoted(null), 400);
  }, [react]);

  const handleNavigateToProfile = useCallback(() => {
    const profilePath = currentStory?.username 
      ? `/${currentStory.username}` 
      : `/app/profile?id=${currentStory?.wallet_address}`;
    onClose();
    navigate(profilePath);
  }, [currentStory, navigate, onClose]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/app`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleRepost = () => {
    toast.success('Reposted!');
    setShareSheetOpen(false);
  };

  const handlePostInlineComment = useCallback(() => {
    if (!inlineCommentText.trim() || !currentStory?.id || isPostingComment) return;
    
    if (!walletAddress) {
      toast.error('Please log in to comment');
      return;
    }
    
    addStoryComment(inlineCommentText.trim());
    setInlineCommentText('');
  }, [inlineCommentText, currentStory?.id, isPostingComment, walletAddress, addStoryComment]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // Desktop action button component (matches ShortsViewer exactly)
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
      {count !== undefined && <span className="text-white text-xs">{formatCount(typeof count === 'string' ? parseInt(count) || 0 : count)}</span>}
    </motion.button>
  );

  if (!isOpen || !currentStory) return null;

  return (
    <motion.div 
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black flex items-center justify-center"
      style={{ 
        touchAction: 'none',
        height: '100dvh',
        width: '100vw',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main content area */}
      <div className={`relative flex items-center justify-center h-full ${isMobile ? 'w-full' : 'gap-4 px-4'}`}>
        
        {/* Left Side Panel - Desktop Only: Action buttons (matches ShortsViewer) */}
        {!isMobile && (
          <div className="w-[80px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col items-center justify-center gap-6">
            {/* Navigation Up */}
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </button>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-4">
              <ActionButton
                icon={ThumbsUp}
                count={likes}
                onClick={() => handleVote('like')}
                active={isLiked}
                activeColor="text-white"
                disabled={isReacting}
                animate={justVoted === 'like'}
              />
              
              <ActionButton
                icon={ThumbsDown}
                count={dislikes}
                onClick={() => handleVote('dislike')}
                active={isDisliked}
                activeColor="text-white"
                disabled={isReacting}
                animate={justVoted === 'dislike'}
              />

              {/* View count */}
              {viewCount !== null && (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 bg-zinc-800/80 rounded-xl flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-white text-xs">{formatCount(viewCount)}</span>
                </div>
              )}

              <ActionButton
                icon={Share2}
                onClick={() => setShareSheetOpen(true)}
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

            {/* Navigation Down */}
            <button
              onClick={goNext}
              disabled={currentIndex === stories.length - 1 && !onSwitchToShorts}
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
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
          >
            {/* Render window of 3 stories (prev/current/next) */}
            <AnimatePresence initial={false}>
              {visibleIndices.map(index => {
                const story = stories[index];
                const offset = index - currentIndex;
                const isActive = index === currentIndex;
                
                return (
                  <motion.div
                    key={story.id}
                    className="absolute inset-0"
                    initial={false}
                    animate={{
                      y: `${offset * 100}%`,
                      translateY: isActive ? dragOffset : dragOffset * 0.3,
                    }}
                    transition={dragOffset === 0 ? SMOOTH_TRANSITION : { duration: 0 }}
                    style={{ zIndex: isActive ? 2 : 1 }}
                  >
                    <StorySlide
                      story={story}
                      isActive={isActive}
                      isPaused={false}
                      isMuted={isMuted}
                      onEnded={goNext}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Mobile-only overlays - TikTok-style layout */}
          {isMobile && (
            <>
              {/* Bottom Left - Creator Info */}
              <div className="absolute bottom-6 left-4 right-20 z-10 pointer-events-auto">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={handleNavigateToProfile}
                    className="flex-shrink-0"
                  >
                    <Avatar className="w-12 h-12 rounded-xl" key={resolvedAvatar || currentStory.id}>
                      <AvatarImage src={resolvedAvatar} alt={currentStory.username || ''} className="rounded-xl" />
                      <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">
                        {(currentStory.username || currentStory.wallet_address)?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex flex-col">
                    <button
                      onClick={handleNavigateToProfile}
                      className="text-white font-semibold text-base drop-shadow-lg text-left"
                    >
                      {currentStory.username ? `@${currentStory.username}` : `${currentStory.wallet_address.slice(0, 6)}...`}
                    </button>
                    <span className="text-white/60 text-xs drop-shadow-lg">
                      {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Side Action Buttons - Vertical stack (matching ShortsViewer) */}
              <div className="absolute right-3 bottom-8 z-10 flex flex-col items-center gap-5 pointer-events-auto">
                {/* Like */}
                <motion.button
                  onClick={() => handleVote('like')}
                  disabled={isReacting}
                  className="flex flex-col items-center gap-1"
                  animate={justVoted === 'like' ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <ThumbsUp className={cn(
                    "w-8 h-8 drop-shadow-lg",
                    isLiked ? "fill-white text-white" : "text-white"
                  )} />
                  <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(likes)}</span>
                </motion.button>
                
                {/* Dislike */}
                <motion.button
                  onClick={() => handleVote('dislike')}
                  disabled={isReacting}
                  className="flex flex-col items-center gap-1"
                  animate={justVoted === 'dislike' ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <ThumbsDown className={cn(
                    "w-8 h-8 drop-shadow-lg",
                    isDisliked ? "fill-white text-white" : "text-white"
                  )} />
                  <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(dislikes)}</span>
                </motion.button>

                {/* Comments */}
                <button
                  onClick={() => setShowComments(true)}
                  className="flex flex-col items-center gap-1"
                >
                  <MessageSquare className="w-8 h-8 text-white drop-shadow-lg" />
                  <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(commentCount)}</span>
                </button>

                {/* View Count */}
                {viewCount !== null && (
                  <div className="flex flex-col items-center gap-1">
                    <Eye className="w-8 h-8 text-white drop-shadow-lg" />
                    <span className="text-white text-xs font-medium drop-shadow-lg">{formatCount(viewCount)}</span>
                  </div>
                )}
                
                {/* Share */}
                <button
                  onClick={() => setShareSheetOpen(true)}
                  className="flex flex-col items-center gap-1"
                >
                  <Share2 className="w-8 h-8 text-white drop-shadow-lg" />
                </button>

                {/* Delete (own stories only) */}
                {isOwnStory && (
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex flex-col items-center gap-1"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-8 h-8 text-red-400 drop-shadow-lg animate-spin" />
                    ) : (
                      <Trash2 className="w-8 h-8 text-red-400 drop-shadow-lg" />
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Side Panel - Desktop Only: Creator info and comments */}
        {!isMobile && (
          <div className="w-[268px] lg:w-[320px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col">
            {/* Creator Info - Top */}
            <div className="bg-zinc-900/50 rounded-2xl p-3 lg:p-4 mb-3">
              <div className="flex items-center gap-2 lg:gap-3">
                <button
                  onClick={handleNavigateToProfile}
                  className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1 text-left"
                >
                  <Avatar className="w-10 h-10 lg:w-12 lg:h-12 flex-shrink-0 rounded-xl" key={resolvedAvatar || currentStory.id}>
                    <AvatarImage src={resolvedAvatar} alt={currentStory.username || ''} className="rounded-xl" />
                    <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-xl">
                      {(currentStory.username || currentStory.wallet_address)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm lg:text-base truncate hover:underline">
                      {currentStory.username ? `@${currentStory.username}` : `${currentStory.wallet_address.slice(0, 6)}...`}
                    </p>
                    <div className="flex items-center gap-2 text-white/60 text-xs lg:text-sm">
                      {viewCount !== null && (
                        <>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {formatCount(viewCount)}
                          </span>
                          <span>•</span>
                        </>
                      )}
                      <span>{formatCount(likes)} {likes === 1 ? 'like' : 'likes'}</span>
                    </div>
                  </div>
                </button>
                <button className="bg-white text-black text-xs lg:text-sm font-semibold px-3 lg:px-4 py-1 lg:py-1.5 rounded-xl hover:bg-white/90 transition-colors flex-shrink-0 max-w-[80px]">
                  Follow
                </button>
              </div>
              <p className="text-white/60 text-xs lg:text-sm mt-2">
                {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
              </p>
            </div>

            {/* Desktop: Inline comments */}
            <div className="flex-1 bg-zinc-900/50 rounded-2xl p-3 lg:p-4 flex flex-col min-h-0">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-3 flex-shrink-0">
                <MessageSquare className="w-4 h-4" />
                <span>{commentCount} Comments</span>
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
                          <span className="text-white/40 text-[10px]">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: false })}</span>
                        </div>
                        <p className="text-white/70 text-xs leading-relaxed line-clamp-2">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Comment input */}
              <div className="flex items-center gap-2 mt-3 pt-3 flex-shrink-0">
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

              {/* Delete button for own stories */}
              {isOwnStory && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-3 mt-3 p-3 hover:bg-red-500/20 rounded-xl transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5 text-red-400" />
                  )}
                  <span className="text-red-400 text-sm">Delete Story</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile top header controls */}
      {isMobile && (
        <>
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 bg-zinc-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-20"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          
          <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
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
            
            <button
              onClick={() => setShareSheetOpen(true)}
              className="w-10 h-10 bg-zinc-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center"
            >
              <MoreHorizontal className="w-5 h-5 text-white" />
            </button>
          </div>
        </>
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
              onClick={handleCopyLink}
              className="flex items-center gap-3 w-full p-4 text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
            >
              <Link className="w-5 h-5" />
              <span className="font-medium">Copy Link</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Comments Drawer (mobile) */}
      {currentStory && (
        <StoryCommentsDrawer
          isOpen={showComments}
          onClose={() => setShowComments(false)}
          storyId={currentStory.id}
        />
      )}
    </motion.div>
  );
}
