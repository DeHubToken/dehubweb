/**
 * Scroll Restoration Hook
 * =======================
 * Preserves and restores scroll position when navigating between pages.
 * Uses React Router's navigationType to detect back navigation.
 * 
 * CRITICAL: This hook prevents the feed from scrolling to top when
 * pressing back from a post page. It saves scroll position continuously
 * and restores it with multiple attempts to handle lazy-loaded content.
 * 
 *  * Reads and writes through lib/document-scroll: the scrolling element here is
 * document.body, so window.scrollY reads 0 and window.scrollTo is a no-op.
 * This hook used to use both, which meant it saved 0 every time and its
 * `savedPosition > 0` guard never opened -- it had been inert since body
 * became the scroller.
 *
 * @module hooks/use-scroll-restoration
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { getDocumentScrollTop, scrollDocumentTo } from '@/lib/document-scroll';

// Store scroll positions keyed by pathname - persists across component mounts
const scrollPositions = new Map<string, number>();

// Track if we've set manual scroll restoration
let hasSetManualRestoration = false;

/**
 * Hook to save and restore scroll position for the current route.
 * Call this in your page component to enable scroll restoration.
 */
export function useScrollRestoration(key?: string) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const storageKey = key || location.pathname;
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  
  // Detect if this is a back navigation (POP = back/forward button)
  const isBackNavigation = navigationType === 'POP';
  
  // Set manual scroll restoration once globally
  useEffect(() => {
    if (!hasSetManualRestoration && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
      hasSetManualRestoration = true;
    }
  }, []);
  
  // Save scroll position continuously
  useEffect(() => {
    const saveScroll = () => {
      if (!isRestoringRef.current) {
        scrollPositions.set(storageKey, getDocumentScrollTop());
      }
    };
    
    // Save immediately on mount (captures position before navigation)
    saveScroll();
    
    window.addEventListener('scroll', saveScroll, { passive: true });
    
    return () => {
      // Save final position before unmounting
      saveScroll();
      window.removeEventListener('scroll', saveScroll);
    };
  }, [storageKey]);
  
  // Restore scroll position when returning via back navigation
  useEffect(() => {
    // Only restore on back navigation and only once per mount
    if (!isBackNavigation || hasRestoredRef.current) {
      return;
    }
    
    const savedPosition = scrollPositions.get(storageKey);
    
    if (savedPosition !== undefined && savedPosition > 0) {
      hasRestoredRef.current = true;
      isRestoringRef.current = true;
      
      // Function to attempt scroll restoration
      const attemptScroll = () => {
        scrollDocumentTo(savedPosition);
      };
      
      // Immediate attempt
      attemptScroll();
      
      // Multiple staggered attempts for lazy-loaded content
      const attempts = [0, 50, 100, 200, 400, 800];
      const timeouts: NodeJS.Timeout[] = [];
      
      attempts.forEach(delay => {
        const timeout = setTimeout(attemptScroll, delay);
        timeouts.push(timeout);
      });
      
      // Use MutationObserver to detect when content is added to DOM
      // This handles lazy-loaded feed items
      mutationObserverRef.current = new MutationObserver(() => {
        attemptScroll();
      });
      
      mutationObserverRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      });
      
      // Clean up after restoration period
      const cleanupTimeout = setTimeout(() => {
        isRestoringRef.current = false;
        mutationObserverRef.current?.disconnect();
      }, 1000);
      
      return () => {
        timeouts.forEach(clearTimeout);
        clearTimeout(cleanupTimeout);
        mutationObserverRef.current?.disconnect();
      };
    }
  }, [storageKey, isBackNavigation]);
  
  return {
    isBackNavigation,
    resetScroll: useCallback(() => {
      scrollPositions.delete(storageKey);
      scrollDocumentTo(0);
    }, [storageKey]),
    saveScroll: useCallback(() => {
      scrollPositions.set(storageKey, getDocumentScrollTop());
    }, [storageKey]),
  };
}

/**
 * Hook to check if current navigation is a back navigation
 */
export function useIsBackNavigation(): boolean {
  const navigationType = useNavigationType();
  return navigationType === 'POP';
}

/**
 * Check if we came from a specific path pattern
 * Note: This is a simple check based on saved positions, not a full navigation stack
 */
export function cameFromPath(pattern: string | RegExp): boolean {
  const keys = Array.from(scrollPositions.keys());
  if (keys.length < 2) return false;
  const prevPath = keys[keys.length - 2];
  if (typeof pattern === 'string') {
    return prevPath?.startsWith(pattern) ?? false;
  }
  return pattern.test(prevPath || '');
}
