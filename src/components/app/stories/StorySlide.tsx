/**
 * Story Slide Component
 * =====================
 * Individual story slide for the vertical carousel viewer.
 * Handles its own video playback based on isActive state.
 * 
 * @module components/app/stories/StorySlide
 */

import { useRef, useEffect, useCallback, memo } from 'react';
import type { Story } from '@/hooks/use-stories';

interface StorySlideProps {
  story: Story;
  isActive: boolean;
  isPaused: boolean;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export const StorySlide = memo(function StorySlide({
  story,
  isActive,
  isPaused,
  onEnded,
  onTimeUpdate,
}: StorySlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Play/pause based on isActive and isPaused state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive && !isPaused) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive, isPaused]);

  // Handle time update for progress tracking
  const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (onTimeUpdate) {
      const video = e.currentTarget;
      if (video.duration && isFinite(video.duration)) {
        onTimeUpdate(video.currentTime, video.duration);
      }
    }
  }, [onTimeUpdate]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        src={story.video_url}
        playsInline
        muted={false}
        preload={isActive ? 'auto' : 'metadata'}
        className="w-full h-full object-cover pointer-events-none"
        onEnded={isActive ? onEnded : undefined}
        onTimeUpdate={isActive ? handleTimeUpdate : undefined}
      />
    </div>
  );
});

export default StorySlide;
