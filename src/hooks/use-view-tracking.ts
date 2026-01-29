/**
 * View Tracking Hooks
 * ===================
 * React hooks for integrating view tracking into components.
 * Uses a shared IntersectionObserver singleton for performance.
 */

import { useEffect, useRef, useCallback } from 'react';
import { videoViewTracker, feedViewTracker } from '@/lib/view-tracker';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// SHARED INTERSECTION OBSERVER SINGLETON
// ============================================================================

/**
 * Shared observer for all feed items - reduces CPU overhead from N observers to 1
 */
class SharedViewObserver {
  private observer: IntersectionObserver | null = null;
  private elementMap = new Map<Element, string>(); // element -> tokenId
  
  private getObserver(): IntersectionObserver {
    if (!this.observer) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const tokenId = this.elementMap.get(entry.target);
            if (!tokenId) return;
            
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
    }
    return this.observer;
  }
  
  observe(element: Element, tokenId: string) {
    this.elementMap.set(element, tokenId);
    this.getObserver().observe(element);
  }
  
  unobserve(element: Element) {
    const tokenId = this.elementMap.get(element);
    if (tokenId) {
      feedViewTracker.onHidden(tokenId);
    }
    this.elementMap.delete(element);
    this.observer?.unobserve(element);
  }
  
  disconnect() {
    this.observer?.disconnect();
    this.elementMap.clear();
    this.observer = null;
  }
}

// Single shared instance
const sharedViewObserver = new SharedViewObserver();

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
// FEED ITEM VIEW TRACKING HOOK (OPTIMIZED)
// ============================================================================

/**
 * Hook to track feed item visibility for batch view recording.
 * Uses a shared IntersectionObserver singleton for better performance.
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
  const observedRef = useRef(false);
  
  useEffect(() => {
    if (!isAuthenticated || !tokenId) return;
    
    const element = elementRef.current;
    if (!element) return;
    
    // Use shared observer
    sharedViewObserver.observe(element, tokenId);
    observedRef.current = true;
    
    return () => {
      if (observedRef.current && element) {
        sharedViewObserver.unobserve(element);
        observedRef.current = false;
      }
    };
  }, [tokenId, isAuthenticated]);
  
  return elementRef;
}

/**
 * Hook that returns a ref callback for tracking feed item views.
 * Alternative API that works better with some component patterns.
 * Uses shared IntersectionObserver for performance.
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
  const currentElement = useRef<Element | null>(null);
  
  // Cleanup function
  useEffect(() => {
    return () => {
      if (currentElement.current) {
        sharedViewObserver.unobserve(currentElement.current);
      }
    };
  }, [tokenId]);
  
  const refCallback = useCallback((element: HTMLDivElement | null) => {
    // Disconnect previous element
    if (currentElement.current) {
      sharedViewObserver.unobserve(currentElement.current);
    }
    
    if (!element || !isAuthenticated || !tokenId) {
      currentElement.current = null;
      return;
    }
    
    currentElement.current = element;
    sharedViewObserver.observe(element, tokenId);
  }, [tokenId, isAuthenticated]);
  
  return refCallback;
}
