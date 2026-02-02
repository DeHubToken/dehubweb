/**
 * Story Viewer Modal
 * ==================
 * TikTok-style full-screen vertical scroll viewer for stories.
 * Scroll/swipe up for next, down for previous. Progress synced to video.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Pause, Play, Trash2, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, type PanInfo } from 'framer-motion';
import type { Story } from '@/hooks/use-stories';
import { buildAvatarUrl } from '@/lib/media-url';

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  stories: Story[];
  initialIndex?: number;
}

export function StoryViewerModal({ isOpen, onClose, stories, initialIndex = 0 }: StoryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const currentStory = stories[currentIndex];
  const isOwnStory = currentStory && walletAddress?.toLowerCase() === currentStory.wallet_address.toLowerCase();

  // Reset to initialIndex when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setProgress(0);
      setIsPaused(false);
    }
  }, [isOpen, initialIndex]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      // Loop randomly when out of stories
      const randomIndex = Math.floor(Math.random() * stories.length);
      setCurrentIndex(randomIndex);
      setProgress(0);
    }
  }, [currentIndex, stories.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  // Mouse wheel handler
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isScrolling) return;
      if (Math.abs(e.deltaY) < 50) return;

      setIsScrolling(true);
      if (e.deltaY > 0) {
        goNext();
      } else {
        goPrev();
      }
      setTimeout(() => setIsScrolling(false), 500);
    };

    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, isScrolling, goNext, goPrev]);

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

  const togglePause = () => {
    setIsPaused((prev) => !prev);
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isScrolling) return;
    
    const threshold = 100;
    if (info.offset.y < -threshold) {
      setIsScrolling(true);
      goNext();
      setTimeout(() => setIsScrolling(false), 500);
    } else if (info.offset.y > threshold) {
      setIsScrolling(true);
      goPrev();
      setTimeout(() => setIsScrolling(false), 500);
    }
  };

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

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.duration && isFinite(video.duration)) {
      setProgress((video.currentTime / video.duration) * 100);
    }
  };

  if (!isOpen || !currentStory) return null;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[70] bg-black flex flex-col touch-none"
    >

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-20 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-white">
            <AvatarImage src={buildAvatarUrl(currentStory.wallet_address, currentStory.avatar) || undefined} />
            <AvatarFallback className="bg-zinc-700 text-white">
              {(currentStory.username || currentStory.wallet_address)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-white font-medium text-sm">
              {currentStory.username ? `@${currentStory.username}` : `${currentStory.wallet_address.slice(0, 6)}...`}
            </p>
            <p className="text-white/60 text-xs">
              {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>

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

      {/* Story content with drag gesture */}
      <motion.div
        className="flex-1 flex items-center justify-center"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        <video
          key={currentStory.id}
          ref={videoRef}
          src={currentStory.video_url}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-contain pointer-events-none"
          onEnded={goNext}
          onTimeUpdate={handleTimeUpdate}
        />
      </motion.div>

      {/* Navigation hints */}
      {currentIndex > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+120px)] z-10 pointer-events-none">
          <ChevronUp className="w-6 h-6 text-white/30 animate-pulse" />
        </div>
      )}
      {currentIndex < stories.length - 1 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%-120px)] z-10 pointer-events-none">
          <ChevronDown className="w-6 h-6 text-white/30 animate-pulse" />
        </div>
      )}

    </div>
  );
}
