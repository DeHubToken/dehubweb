/**
 * View Tracking Hooks
 * ===================
 * React hooks for integrating view tracking into components.
 */

import { useEffect, useRef, useCallback } from 'react';
import { videoViewTracker, feedViewTracker } from '@/lib/view-tracker';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// VIDEO VIEW TRACKING HOOK
// ============================================================================

/**
 * Hook to track video watch progress and fire view once threshold is met.
 * 
 * @example
 * ```tsx
 * const { onTimeUpdate } = useVideoViewTracking(video.id);
 * 
 * <video
 *   onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime, e.currentTarget.duration)}
 * />
 * ```
 */
export function useVideoViewTracking(tokenId: string) {
  const { isAuthenticated } = useAuth();
  
  const onTimeUpdate = useCallback((currentTime: number, duration: number) => {
    if (!isAuthenticated) return;
    if (!tokenId || !duration || duration <= 0) return;
    
    videoViewTracker.updateProgress(tokenId, currentTime, duration);
  }, [tokenId, isAuthenticated]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoViewTracker.reset(tokenId);
    };
  }, [tokenId]);
  
  return {
    onTimeUpdate,
    hasViewed: videoViewTracker.hasViewed(tokenId),
  };
}

// ============================================================================
// FEED ITEM VIEW TRACKING HOOK
// ============================================================================

/**
 * Hook to track feed item visibility for batch view recording.
 * Uses IntersectionObserver to detect when items enter/leave viewport.
 * 
 * @example
 * ```tsx
 * const viewRef = useFeedViewTracking(post.id);
 * 
 * <div ref={viewRef}>
 *   <PostCard post={post} />
 * </div>
 * ```
 */
export function useFeedViewTracking(tokenId: string) {
  const { isAuthenticated } = useAuth();
  const elementRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  useEffect(() => {
    if (!isAuthenticated || !tokenId) return;
    
    const element = elementRef.current;
    if (!element) return;
    
    // Create observer to track visibility
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            feedViewTracker.onVisible(tokenId);
          } else {
            feedViewTracker.onHidden(tokenId);
          }
        });
      },
      { 
        threshold: 0.5, // Item is "visible" when 50%+ is in viewport
        rootMargin: '0px',
      }
    );
    
    observerRef.current.observe(element);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      // Mark as hidden when unmounting
      feedViewTracker.onHidden(tokenId);
    };
  }, [tokenId, isAuthenticated]);
  
  return elementRef;
}

/**
 * Hook that returns a ref callback for tracking feed item views.
 * Alternative API that works better with some component patterns.
 * 
 * @example
 * ```tsx
 * const trackViewRef = useFeedViewTrackingCallback(post.id);
 * 
 * <div ref={trackViewRef}>
 *   <ImageCard post={post} />
 * </div>
 * ```
 */
export function useFeedViewTrackingCallback(tokenId: string) {
  const { isAuthenticated } = useAuth();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentElement = useRef<Element | null>(null);
  
  // Cleanup function
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (tokenId) {
        feedViewTracker.onHidden(tokenId);
      }
    };
  }, [tokenId]);
  
  const refCallback = useCallback((element: HTMLDivElement | null) => {
    // Disconnect previous observer
    if (observerRef.current && currentElement.current) {
      observerRef.current.unobserve(currentElement.current);
      observerRef.current.disconnect();
    }
    
    if (!element || !isAuthenticated || !tokenId) {
      currentElement.current = null;
      return;
    }
    
    currentElement.current = element;
    
    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            feedViewTracker.onVisible(tokenId);
          } else {
            feedViewTracker.onHidden(tokenId);
          }
        });
      },
      { 
        threshold: 0.5,
        rootMargin: '0px',
      }
    );
    
    observerRef.current.observe(element);
  }, [tokenId, isAuthenticated]);
  
  return refCallback;
}
