/**
 * Story Viewer Modal
 * ==================
 * Full-screen viewer for watching stories with auto-progress.
 * Allows users to delete their own stories.
 */

import { useState, useRef, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const currentStory = stories[currentIndex];
  const isOwnStory = currentStory && walletAddress?.toLowerCase() === currentStory.wallet_address.toLowerCase();

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (!isOpen || !currentStory) return;

    // Reset progress when story changes
    setProgress(0);

    // Auto-advance progress
    if (!isPaused) {
      progressRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            goNext();
            return 0;
          }
          return prev + (100 / 300); // ~30 seconds (300 ticks at 100ms)
        });
      }, 100);
    }

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [isOpen, currentIndex, isPaused]);

  const goNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  };

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

  const handleDelete = async () => {
    if (!currentStory || !isOwnStory) return;

    setIsDeleting(true);
    try {
      // Delete from database
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', currentStory.id);

      if (error) throw error;

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['stories'] });

      toast.success('Story deleted');

      // Navigate to next story or close
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

  const handleClose = () => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
    }
    onClose();
  };

  if (!isOpen || !currentStory) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2">
        {stories.map((_, index) => (
          <div key={index} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100 ease-linear"
              style={{
                width: index < currentIndex ? '100%' : index === currentIndex ? `${progress}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-between px-4">
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
          {/* Delete button - only show for own stories */}
          {isOwnStory && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-8 h-8 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center disabled:opacity-50"
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
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
          >
            {isPaused ? (
              <Play className="w-4 h-4 text-white" />
            ) : (
              <Pause className="w-4 h-4 text-white" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Story content */}
      <div className="flex-1 flex items-center justify-center">
        <video
          ref={videoRef}
          src={currentStory.video_url}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-contain"
          onEnded={goNext}
        />
      </div>

      {/* Navigation areas */}
      <button
        onClick={goPrev}
        className="absolute left-0 top-20 bottom-20 w-1/3 z-10"
        aria-label="Previous story"
      />
      <button
        onClick={goNext}
        className="absolute right-0 top-20 bottom-20 w-1/3 z-10"
        aria-label="Next story"
      />

      {/* Navigation hints */}
      {currentIndex > 0 && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
          <ChevronLeft className="w-8 h-8 text-white/50" />
        </div>
      )}
      {currentIndex < stories.length - 1 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10">
          <ChevronRight className="w-8 h-8 text-white/50" />
        </div>
      )}
    </div>
  );
}
