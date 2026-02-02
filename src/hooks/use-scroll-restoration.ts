/**
 * Scroll Restoration Hook
 * =======================
 * Preserves and restores scroll position when navigating between pages.
 * Uses a global navigation stack to detect back navigation.
 * 
 * @module hooks/use-scroll-restoration
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Global navigation stack to track history
const navigationStack: string[] = [];

// Store scroll positions keyed by pathname
const scrollPositions = new Map<string, number>();

/**
 * Update navigation stack when route changes
 */
function updateNavigationStack(pathname: string, navigationType: string): boolean {
  const isBackNavigation = navigationType === 'POP';
  
  if (isBackNavigation) {
    // Pop the current page from stack (we're going back)
    navigationStack.pop();
  } else {
    // Push new page to stack
    navigationStack.push(pathname);
  }
  
  return isBackNavigation;
}

/**
 * Check if we came from a specific path pattern
 */
export function cameFromPath(pattern: string | RegExp): boolean {
  if (navigationStack.length < 1) return false;
  const prevPath = navigationStack[navigationStack.length - 1];
  if (typeof pattern === 'string') {
    return prevPath?.startsWith(pattern) ?? false;
  }
  return pattern.test(prevPath || '');
}

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
  
  // Detect if this is a back navigation
  const isBackNavigation = navigationType === 'POP';
  
  // Save scroll position continuously
  useEffect(() => {
    const saveScroll = () => {
      if (!isRestoringRef.current) {
        scrollPositions.set(storageKey, window.scrollY);
      }
    };
    
    window.addEventListener('scroll', saveScroll, { passive: true });
    
    return () => {
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
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
        
        // Multiple attempts for lazy-loaded content
        const attempts = [50, 150, 300];
        attempts.forEach(delay => {
          setTimeout(() => {
            window.scrollTo(0, savedPosition);
          }, delay);
        });
        
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 400);
      });
    }
  }, [storageKey, isBackNavigation]);
  
  return {
    isBackNavigation,
    resetScroll: useCallback(() => {
      scrollPositions.delete(storageKey);
      window.scrollTo(0, 0);
    }, [storageKey]),
    saveScroll: useCallback(() => {
      scrollPositions.set(storageKey, window.scrollY);
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
