/**
 * Scroll Restoration Hook
 * =======================
 * Preserves and restores scroll position when navigating between pages.
 * Uses sessionStorage to persist scroll positions across navigation.
 * 
 * @module hooks/use-scroll-restoration
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Store scroll positions keyed by pathname
const scrollPositions = new Map<string, number>();

/**
 * Hook to save and restore scroll position for the current route.
 * Call this in your page component to enable scroll restoration.
 */
export function useScrollRestoration(key?: string) {
  const location = useLocation();
  const storageKey = key || location.pathname;
  const isRestoringRef = useRef(false);
  
  // Save scroll position before navigating away
  useEffect(() => {
    const saveScroll = () => {
      if (!isRestoringRef.current) {
        scrollPositions.set(storageKey, window.scrollY);
      }
    };
    
    // Save on scroll (debounced via passive listener)
    window.addEventListener('scroll', saveScroll, { passive: true });
    
    // Save before unload or navigation
    return () => {
      saveScroll();
      window.removeEventListener('scroll', saveScroll);
    };
  }, [storageKey]);
  
  // Restore scroll position when returning to this page
  useEffect(() => {
    const savedPosition = scrollPositions.get(storageKey);
    
    if (savedPosition !== undefined && savedPosition > 0) {
      isRestoringRef.current = true;
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
        
        // Double-check after a short delay (for lazy-loaded content)
        setTimeout(() => {
          window.scrollTo(0, savedPosition);
          isRestoringRef.current = false;
        }, 100);
      });
    }
  }, [storageKey]);
  
  // Return a function to manually reset scroll position
  return {
    resetScroll: () => {
      scrollPositions.delete(storageKey);
      window.scrollTo(0, 0);
    },
    saveScroll: () => {
      scrollPositions.set(storageKey, window.scrollY);
    },
  };
}

/**
 * Check if we're navigating back (vs forward/direct navigation)
 */
export function useIsBackNavigation() {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);
  const isBackRef = useRef(false);
  
  useEffect(() => {
    // Simple heuristic: if going from /app/post/* to /app, it's likely a back navigation
    if (prevPathRef.current?.startsWith('/app/post/') && location.pathname === '/app') {
      isBackRef.current = true;
    } else {
      isBackRef.current = false;
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname]);
  
  return isBackRef.current;
}
