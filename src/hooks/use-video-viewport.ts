/**
 * Video Viewport Management Hook
 * ==============================
 * Provides viewport-based video lifecycle management for scalable playback.
 * Automatically pauses videos when they leave the viewport and optionally
 * resumes when they return. Manages resource cleanup for memory efficiency.
 * 
 * @module hooks/use-video-viewport
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseVideoViewportOptions {
  /** Threshold for considering video "in view" (0-1, default 0.5) */
  threshold?: number;
  /** Root margin for IntersectionObserver (default '-10%') */
  rootMargin?: string;
  /** Whether to auto-resume when video returns to viewport */
  autoResume?: boolean;
  /** Callback when video enters viewport */
  onEnterViewport?: () => void;
  /** Callback when video leaves viewport */
  onLeaveViewport?: () => void;
  /** Whether the video is currently playing (for auto-resume logic) */
  isPlaying?: boolean;
}

interface UseVideoViewportReturn {
  /** Ref to attach to the video container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Ref to attach to the video element */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Whether the video is currently in the viewport */
  isInViewport: boolean;
  /** Whether the video should be rendered (for virtualization) */
  shouldRender: boolean;
  /** Manually pause the video */
  pauseVideo: () => void;
  /** Manually play the video */
  playVideo: () => Promise<void>;
  /** Clean up video resources (for unmount) */
  cleanup: () => void;
}

/**
 * Hook for viewport-aware video management
 * Handles auto-pause/play based on visibility and resource cleanup
 */
export function useVideoViewport(options: UseVideoViewportOptions = {}): UseVideoViewportReturn {
  const {
    threshold = 0.5,
    rootMargin = '-10%',
    autoResume = false,
    onEnterViewport,
    onLeaveViewport,
    isPlaying = false,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const wasPlayingRef = useRef(false);
  const hasBeenVisibleRef = useRef(false);

  // Pause video helper
  const pauseVideo = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) {
      wasPlayingRef.current = true;
      videoRef.current.pause();
    }
  }, []);

  // Play video helper
  const playVideo = useCallback(async () => {
    if (videoRef.current && videoRef.current.paused) {
      try {
        await videoRef.current.play();
        wasPlayingRef.current = false;
      } catch (err) {
        // Autoplay may be blocked - that's okay
        console.debug('Video autoplay blocked:', err);
      }
    }
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load(); // Reset the video element
    }
  }, []);

  // Set up IntersectionObserver for viewport detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        const wasInViewport = isInViewport;
        const nowInViewport = entry.isIntersecting;

        setIsInViewport(nowInViewport);

        if (nowInViewport) {
          // Video entered viewport
          hasBeenVisibleRef.current = true;
          setShouldRender(true);
          onEnterViewport?.();

          // Auto-resume if it was playing before and autoResume is enabled
          if (autoResume && wasPlayingRef.current) {
            playVideo();
          }
        } else if (wasInViewport) {
          // Video left viewport
          onLeaveViewport?.();

          // Remember if it was playing and pause it
          if (videoRef.current && !videoRef.current.paused) {
            wasPlayingRef.current = true;
          }
          pauseVideo();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(container);

    // Initial render check with larger margin
    const preloadObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldRender(true);
        }
      },
      {
        rootMargin: '200px', // Preload videos slightly before they enter viewport
      }
    );

    preloadObserver.observe(container);

    return () => {
      observer.disconnect();
      preloadObserver.disconnect();
    };
  }, [threshold, rootMargin, autoResume, isInViewport, onEnterViewport, onLeaveViewport, pauseVideo, playVideo]);

  // Track playing state changes
  useEffect(() => {
    if (isPlaying) {
      wasPlayingRef.current = true;
    }
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    containerRef,
    videoRef,
    isInViewport,
    shouldRender,
    pauseVideo,
    playVideo,
    cleanup,
  };
}

/**
 * Video Manager for coordinating multiple video instances
 * Ensures only one video plays at a time across the feed
 */
class VideoPlaybackManager {
  private static instance: VideoPlaybackManager;
  private activeVideo: HTMLVideoElement | null = null;
  private registeredVideos: Set<HTMLVideoElement> = new Set();
  private maxConcurrentLoaded = 10; // Maximum videos to keep loaded

  private constructor() {}

  static getInstance(): VideoPlaybackManager {
    if (!VideoPlaybackManager.instance) {
      VideoPlaybackManager.instance = new VideoPlaybackManager();
    }
    return VideoPlaybackManager.instance;
  }

  register(video: HTMLVideoElement): void {
    this.registeredVideos.add(video);
    this.enforceLimit();
  }

  unregister(video: HTMLVideoElement): void {
    this.registeredVideos.delete(video);
    if (this.activeVideo === video) {
      this.activeVideo = null;
    }
  }

  setActive(video: HTMLVideoElement): void {
    // Pause the currently active video if different
    if (this.activeVideo && this.activeVideo !== video) {
      this.activeVideo.pause();
    }
    this.activeVideo = video;
  }

  pauseActive(): void {
    if (this.activeVideo) {
      this.activeVideo.pause();
      this.activeVideo = null;
    }
  }

  private enforceLimit(): void {
    // If we have too many videos registered, unload the oldest ones
    if (this.registeredVideos.size > this.maxConcurrentLoaded) {
      const videosArray = Array.from(this.registeredVideos);
      const toRemove = videosArray.slice(0, videosArray.length - this.maxConcurrentLoaded);
      
      toRemove.forEach(video => {
        if (video !== this.activeVideo) {
          video.pause();
          video.removeAttribute('src');
          video.load();
          this.registeredVideos.delete(video);
        }
      });
    }
  }

  getStats(): { registered: number; active: boolean } {
    return {
      registered: this.registeredVideos.size,
      active: this.activeVideo !== null,
    };
  }
}

export const videoManager = VideoPlaybackManager.getInstance();

/**
 * Hook for coordinating video playback with the global manager
 */
export function useVideoPlaybackCoordinator(videoRef: React.RefObject<HTMLVideoElement>) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    videoManager.register(video);

    const handlePlay = () => {
      videoManager.setActive(video);
    };

    video.addEventListener('play', handlePlay);

    return () => {
      video.removeEventListener('play', handlePlay);
      videoManager.unregister(video);
    };
  }, [videoRef]);

  const setAsActive = useCallback(() => {
    if (videoRef.current) {
      videoManager.setActive(videoRef.current);
    }
  }, [videoRef]);

  return { setAsActive };
}
