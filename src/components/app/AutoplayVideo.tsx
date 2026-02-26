/**
 * Autoplay Video Component
 * ========================
 * Lazy-loading video that only plays when visible on screen.
 * Uses IntersectionObserver to start/stop playback and control preloading.
 * Prevents bandwidth waste from off-screen videos.
 */

import { useRef, useEffect, useState, memo } from 'react';

interface AutoplayVideoProps {
  src: string;
  poster?: string;
  className?: string;
  /** How much of the video must be visible to trigger play (0-1). Default 0.5 */
  threshold?: number;
  /** Root margin for earlier/later trigger. Default "100px" */
  rootMargin?: string;
  /** When true, video won't load or play regardless of visibility. Used for staged loading. */
  disabled?: boolean;
}

export const AutoplayVideo = memo(function AutoplayVideo({
  src,
  poster,
  className,
  threshold = 0.5,
  rootMargin = '100px',
  disabled = false,
}: AutoplayVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  // Play/pause based on visibility and disabled state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible && !disabled) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isVisible, disabled]);

  const shouldLoad = isVisible && !disabled;

  return (
    <div ref={containerRef} className={className}>
      <video
        ref={videoRef}
        src={shouldLoad ? src : undefined}
        poster={poster}
        className="w-full h-full object-cover"
        loop
        muted
        playsInline
        preload={shouldLoad ? 'auto' : 'none'}
      />
    </div>
  );
});
