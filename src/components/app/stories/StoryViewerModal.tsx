/**
 * Story Viewer Modal
 * ==================
 * TikTok-style full-screen vertical carousel viewer for stories.
 * Renders 3 stories (prev/current/next) for smooth transitions.
 * Scroll/swipe up for next, down for previous.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import type { Story } from '@/hooks/use-stories';
import { buildAvatarUrl } from '@/lib/media-url';
import { StorySlide } from './StorySlide';

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stories: Story[];
  initialIndex?: number;
}

// Spring animation config for smooth carousel transitions
const SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
} as const;

export function StoryViewerModal({ isOpen, onClose, stories, initialIndex = 0 }: StoryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const currentStory = stories[currentIndex];
  const isOwnStory = currentStory && walletAddress?.toLowerCase() === currentStory.wallet_address.toLowerCase();

  // Compute visible indices for the 3-story window
  const visibleIndices = useMemo(() => {
    return [
      currentIndex - 1, // Previous
      currentIndex,     // Current
      currentIndex + 1, // Next
    ].filter(i => i >= 0 && i < stories.length);
  }, [currentIndex, stories.length]);

  // Reset to initialIndex when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setProgress(0);
      setIsPaused(false);
      setDragOffset(0);
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
      setProgress(0);
      setTimeout(() => setIsTransitioning(false), 350);
    } else {
      // Loop randomly when out of stories
      setIsTransitioning(true);
      const randomIndex = Math.floor(Math.random() * stories.length);
      setCurrentIndex(randomIndex);
      setProgress(0);
      setTimeout(() => setIsTransitioning(false), 350);
    }
  }, [currentIndex, stories.length, isTransitioning]);

  const goPrev = useCallback(() => {
    if (isTransitioning) return;
    
    if (currentIndex > 0) {
      setIsTransitioning(true);
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
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
        case ' ':
          e.preventDefault();
          togglePause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goNext, goPrev, onClose]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Handle drag for visual feedback during swipe
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

  const handleTimeUpdate = useCallback((currentTime: number, duration: number) => {
    if (duration > 0) {
      setProgress((currentTime / duration) * 100);
    }
  }, []);

  // Prevent touch events from bubbling
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  if (!isOpen || !currentStory) return null;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[70] bg-black flex flex-col touch-none"
      style={{ 
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: '100dvh',
        width: '100vw',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header - overlaid on video */}
      <div className="absolute top-[env(safe-area-inset-top,0px)] left-0 right-0 z-20 flex items-center justify-between px-4 pt-3">
        <button 
          onClick={() => {
            const profilePath = currentStory.username 
              ? `/${currentStory.username}` 
              : `/app/profile?id=${currentStory.wallet_address}`;
            onClose();
            navigate(profilePath);
          }}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <Avatar className="w-10 h-10 border-2 border-white">
            <AvatarImage src={buildAvatarUrl(currentStory.wallet_address, currentStory.avatar) || undefined} />
            <AvatarFallback className="bg-zinc-700 text-white">
              {(currentStory.username || currentStory.wallet_address)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-left">
            <p className="text-white font-medium text-sm">
              {currentStory.username ? `@${currentStory.username}` : `${currentStory.wallet_address.slice(0, 6)}...`}
            </p>
            <p className="text-white/60 text-xs">
              {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {isOwnStory && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-9 h-9 rounded-xl bg-red-500/60 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 text-white" />
              )}
            </button>
          )}
          <button
            onClick={togglePause}
            className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center"
          >
            {isPaused ? (
              <Play className="w-4 h-4 text-white" />
            ) : (
              <Pause className="w-4 h-4 text-white" />
            )}
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Story content - Vertical Carousel Stack */}
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
                transition={dragOffset === 0 ? SPRING_TRANSITION : { duration: 0 }}
                style={{ zIndex: isActive ? 2 : 1 }}
              >
                <StorySlide
                  story={story}
                  isActive={isActive}
                  isPaused={isPaused}
                  onEnded={goNext}
                  onTimeUpdate={isActive ? handleTimeUpdate : undefined}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-[env(safe-area-inset-bottom,0px)] left-0 right-0 z-20 px-4 pb-4">
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
