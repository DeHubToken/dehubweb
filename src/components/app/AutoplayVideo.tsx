/**
 * Autoplay Video Component
 * ========================
 * Lazy-loading video that only plays when visible on screen.
 * Uses IntersectionObserver to start/stop playback and control preloading.
 * Shows a skeleton shimmer while the video is loading.
 * Prevents bandwidth waste from off-screen videos.
 */

import { useRef, useEffect, useState, memo } from 'react';
import { cn } from '@/lib/utils';

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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

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

  // Reset state when src changes or becomes disabled
  useEffect(() => {
    if (disabled) {
      setHasLoaded(false);
      setHasError(false);
    }
  }, [disabled, src]);

  const shouldLoad = isVisible && !disabled;

  // If video has a format error (H.265/HEVC), just show poster
  if (hasError) {
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        {poster ? (
          <img src={poster} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-white/[0.06]" />
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Skeleton shimmer — visible until video has loaded data */}
      {!hasLoaded && (
        <div className="absolute inset-0 z-[1]">
          {poster ? (
            <img src={poster} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full animate-pulse bg-white/[0.06]" />
          )}
        </div>
      )}
      <video
        ref={videoRef}
        src={shouldLoad ? src : undefined}
        poster={poster}
        className="w-full h-full object-cover"
        loop
        muted
        playsInline
        preload={shouldLoad ? 'auto' : 'none'}
        onLoadedData={() => setHasLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
});
