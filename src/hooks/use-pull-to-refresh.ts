/**
 * Pull-to-Refresh Hook
 * ====================
 * Reusable hook for implementing pull-to-refresh functionality.
 * Supports touch and mouse-drag gestures only (wheel/trackpad disabled).
 * Requires deliberate intent: user must pause at top before pulling.
 * 
 * @module hooks/use-pull-to-refresh
 */

import { useState, useRef, useCallback, RefObject } from 'react';

/** Distance required to trigger refresh */
const DEFAULT_PULL_THRESHOLD = 120;

/** Time user must stay at top before pull activates (ms) */
const SETTLE_DELAY = 200;

/** Cooldown between refreshes (ms) */
const REFRESH_COOLDOWN = 3000;

interface UsePullToRefreshOptions {
  /** Distance required to trigger refresh */
  pullThreshold?: number;
  /** Callback when refresh is triggered */
  onRefresh: () => void;
  /** Whether refresh is currently in progress */
  isRefreshing: boolean;
  /** Ref to the container element that pull-to-refresh should work within */
  containerRef?: RefObject<HTMLElement>;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isPulling: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

export function usePullToRefresh({
  pullThreshold = DEFAULT_PULL_THRESHOLD,
  onRefresh,
  isRefreshing,
  containerRef,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const wasAtTopOnStart = useRef<boolean>(false);
  
  // Settle time tracking - user must pause at top before pull activates
  const topSettleTime = useRef<number | null>(null);
  const isSettledAtTop = useRef<boolean>(false);
  
  // Cooldown between refreshes
  const lastRefreshTime = useRef<number>(0);

  // Helper to check if we're truly at the top (both window AND container)
  const isAtTop = useCallback(() => {
    // Check window/document scroll
    const windowScrollTop = Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop
    );
    if (windowScrollTop > 2) return false;
    
    // If there's a container ref, also check its scroll position
    if (containerRef?.current) {
      const containerScrollTop = containerRef.current.scrollTop;
      if (containerScrollTop > 2) return false;
      
      // Also check for any scrollable child elements within the container
      const scrollableChildren = containerRef.current.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
      for (const child of scrollableChildren) {
        if ((child as HTMLElement).scrollTop > 2) return false;
      }
    }
    
    return true;
  }, [containerRef]);

  // Check if user has settled at top long enough
  const checkSettled = useCallback(() => {
    if (!isAtTop()) {
      topSettleTime.current = null;
      isSettledAtTop.current = false;
      return false;
    }
    
    const now = Date.now();
    
    if (topSettleTime.current === null) {
      // Just arrived at top, start the timer
      topSettleTime.current = now;
      isSettledAtTop.current = false;
      return false;
    }
    
    // Check if enough time has passed
    if (now - topSettleTime.current >= SETTLE_DELAY) {
      isSettledAtTop.current = true;
      return true;
    }
    
    return false;
  }, [isAtTop]);

  // Trigger the refresh with cooldown check
  const triggerRefresh = useCallback(() => {
    const now = Date.now();
    
    // Check cooldown
    if (now - lastRefreshTime.current < REFRESH_COOLDOWN) {
      return;
    }
    
    if (!isRefreshing) {
      lastRefreshTime.current = now;
      onRefresh();
    }
  }, [isRefreshing, onRefresh]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Reset settle state on new touch
    const atTop = isAtTop();
    wasAtTopOnStart.current = atTop;
    
    if (atTop) {
      // Start or continue settle timer
      if (topSettleTime.current === null) {
        topSettleTime.current = Date.now();
      }
      pullStartY.current = e.touches[0].clientY;
    } else {
      topSettleTime.current = null;
      isSettledAtTop.current = false;
    }
  }, [isAtTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Only process if we started at the top
    if (!wasAtTopOnStart.current || pullStartY.current === null) return;
    
    // Check if we're still at top
    if (!isAtTop()) {
      // User scrolled away from top, cancel pull
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
      topSettleTime.current = null;
      isSettledAtTop.current = false;
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY.current;
    
    // Only show pull indicator if user has settled at top AND is pulling down
    if (distance > 0 && checkSettled()) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
    } else if (distance <= 0) {
      // Moving up while at top, don't show indicator
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isAtTop, pullThreshold, checkSettled]);

  const handleTouchEnd = useCallback(() => {
    if (isPulling && pullDistance >= pullThreshold && wasAtTopOnStart.current && isSettledAtTop.current) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
    // Don't reset settle time here - keep it for quick consecutive pulls
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh]);

  // Mouse handlers for desktop (drag gesture only, not scroll wheel)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const atTop = isAtTop();
    wasAtTopOnStart.current = atTop;
    
    if (atTop) {
      if (topSettleTime.current === null) {
        topSettleTime.current = Date.now();
      }
      pullStartY.current = e.clientY;
    } else {
      topSettleTime.current = null;
      isSettledAtTop.current = false;
    }
  }, [isAtTop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!wasAtTopOnStart.current || pullStartY.current === null) return;
    
    if (!isAtTop()) {
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
      topSettleTime.current = null;
      isSettledAtTop.current = false;
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    const distance = e.clientY - pullStartY.current;
    if (distance > 0 && checkSettled()) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
    } else if (distance <= 0) {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isAtTop, pullThreshold, checkSettled]);

  const handleMouseUp = useCallback(() => {
    if (isPulling && pullDistance >= pullThreshold && wasAtTopOnStart.current && isSettledAtTop.current) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh]);

  const handleMouseLeave = useCallback(() => {
    if (isPulling) {
      setPullDistance(0);
      setIsPulling(false);
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
    }
  }, [isPulling]);

  // NOTE: Wheel/trackpad refresh is intentionally removed
  // Scrolling up at the top should just stop, not trigger refresh
  // This matches standard mobile app behavior (Twitter, Instagram, etc.)

  return {
    pullDistance,
    isPulling,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
    },
  };
}
