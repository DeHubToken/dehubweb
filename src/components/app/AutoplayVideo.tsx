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
}

export const AutoplayVideo = memo(function AutoplayVideo({
  src,
  poster,
  className,
  threshold = 0.5,
  rootMargin = '100px',
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

  // Play/pause based on visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isVisible]);

  return (
    <div ref={containerRef} className={className}>
      <video
        ref={videoRef}
        src={isVisible ? src : undefined}
        poster={poster}
        className="w-full h-full object-cover"
        loop
        muted
        playsInline
        preload={isVisible ? 'auto' : 'none'}
      />
    </div>
  );
});
