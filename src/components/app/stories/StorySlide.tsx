/**
 * Story Slide Component
 * =====================
 * Individual story slide for the vertical carousel viewer.
 * Handles its own video playback based on isActive state.
 * 
 * @module components/app/stories/StorySlide
 */

import { useRef, useEffect, memo } from 'react';
import type { Story } from '@/hooks/use-stories';

interface StorySlideProps {
  story: Story;
  isActive: boolean;
  isPaused: boolean;
  isMuted?: boolean;
  onEnded?: () => void;
}

export const StorySlide = memo(function StorySlide({
  story,
  isActive,
  isPaused,
  isMuted = false,
  onEnded,
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

  // Update muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        src={story.video_url}
        playsInline
        muted={isMuted}
        preload={isActive ? 'auto' : 'metadata'}
        className="w-full h-full object-cover pointer-events-none"
        onEnded={isActive ? onEnded : undefined}
      />
    </div>
  );
});

export default StorySlide;
