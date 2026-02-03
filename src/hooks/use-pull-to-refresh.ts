/**
 * Pull-to-Refresh Hook
 * ====================
 * Reusable hook for implementing pull-to-refresh functionality.
 * Supports touch, mouse, and wheel gestures.
 * Only triggers when interacting within the specified container.
 * 
 * IMPORTANT: Uses a "hold-to-refresh" mechanism - user must hold at threshold
 * for HOLD_DURATION_MS before refresh triggers. This prevents accidental 
 * refreshes when users just want to scroll to top quickly.
 * 
 * @module hooks/use-pull-to-refresh
 */

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

const DEFAULT_PULL_THRESHOLD = 80;
const HOLD_DURATION_MS = 420; // Time to hold at threshold before triggering

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
  /** Whether user is holding at threshold (waiting for timer) */
  isHoldingAtThreshold: boolean;
  /** Progress of hold timer (0-1) */
  holdProgress: number;
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
  const [isHoldingAtThreshold, setIsHoldingAtThreshold] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  
  const pullStartY = useRef<number | null>(null);
  const wasAtTopOnStart = useRef<boolean>(false);
  const wheelAccumulator = useRef<number>(0);
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null);
  const isHoveringContainer = useRef<boolean>(false);
  
  // Hold timer refs
  const holdStartTime = useRef<number | null>(null);
  const holdAnimationFrame = useRef<number | null>(null);
  const holdTimerActive = useRef<boolean>(false);
  
  // Synchronous lock to prevent race conditions with rapid events
  const hasTriggeredRef = useRef<boolean>(false);
  const lastTriggerTime = useRef<number>(0);
  const TRIGGER_COOLDOWN_MS = 1000;

  // Reset the trigger lock when refresh completes
  useEffect(() => {
    if (!isRefreshing) {
      hasTriggeredRef.current = false;
    }
  }, [isRefreshing]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (holdAnimationFrame.current) {
        cancelAnimationFrame(holdAnimationFrame.current);
      }
    };
  }, []);

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
    // This handles nested scrollable containers like MusicFeed
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

  // Trigger the refresh with synchronous lock to prevent double-fires
  const triggerRefresh = useCallback(() => {
    const now = Date.now();
    // Synchronous checks prevent race conditions from rapid events
    if (
      hasTriggeredRef.current || 
      isRefreshing || 
      now - lastTriggerTime.current < TRIGGER_COOLDOWN_MS
    ) {
      return;
    }
    hasTriggeredRef.current = true;
    lastTriggerTime.current = now;
    onRefresh();
  }, [isRefreshing, onRefresh]);

  // Start the hold timer when threshold is reached
  const startHoldTimer = useCallback(() => {
    if (holdTimerActive.current || hasTriggeredRef.current || isRefreshing) return;
    
    holdTimerActive.current = true;
    holdStartTime.current = Date.now();
    setIsHoldingAtThreshold(true);
    
    const updateProgress = () => {
      if (!holdTimerActive.current || !holdStartTime.current) return;
      
      const elapsed = Date.now() - holdStartTime.current;
      const progress = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setHoldProgress(progress);
      
      if (progress >= 1) {
        // Timer complete - trigger refresh
        triggerRefresh();
        cancelHoldTimer();
      } else {
        holdAnimationFrame.current = requestAnimationFrame(updateProgress);
      }
    };
    
    holdAnimationFrame.current = requestAnimationFrame(updateProgress);
  }, [isRefreshing, triggerRefresh]);

  // Cancel the hold timer
  const cancelHoldTimer = useCallback(() => {
    holdTimerActive.current = false;
    holdStartTime.current = null;
    setIsHoldingAtThreshold(false);
    setHoldProgress(0);
    
    if (holdAnimationFrame.current) {
      cancelAnimationFrame(holdAnimationFrame.current);
      holdAnimationFrame.current = null;
    }
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow pull-to-refresh if we're at the very top when touch starts
    wasAtTopOnStart.current = isAtTop();
    if (wasAtTopOnStart.current) {
      pullStartY.current = e.touches[0].clientY;
    }
  }, [isAtTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Only process if we started at the top AND we're still at the top
    if (!wasAtTopOnStart.current || pullStartY.current === null) return;
    if (!isAtTop()) {
      // User scrolled away from top, cancel pull
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
      setPullDistance(0);
      setIsPulling(false);
      cancelHoldTimer();
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY.current;
    
    // Only start pulling if moving downward
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
      
      // Start hold timer when threshold is reached
      if (resistedDistance >= pullThreshold) {
        startHoldTimer();
      } else {
        // Dropped below threshold - cancel timer
        cancelHoldTimer();
      }
    } else {
      // Moving up while at top, don't show indicator
      setPullDistance(0);
      setIsPulling(false);
      cancelHoldTimer();
    }
  }, [isAtTop, pullThreshold, startHoldTimer, cancelHoldTimer]);

  const handleTouchEnd = useCallback(() => {
    // Cancel timer on release - refresh only triggers if timer completed
    cancelHoldTimer();
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
  }, [cancelHoldTimer]);

  // Mouse handlers for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    wasAtTopOnStart.current = isAtTop();
    if (wasAtTopOnStart.current) {
      pullStartY.current = e.clientY;
    }
  }, [isAtTop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!wasAtTopOnStart.current || pullStartY.current === null) return;
    if (!isAtTop()) {
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
      setPullDistance(0);
      setIsPulling(false);
      cancelHoldTimer();
      return;
    }

    const distance = e.clientY - pullStartY.current;
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
      
      // Start hold timer when threshold is reached
      if (resistedDistance >= pullThreshold) {
        startHoldTimer();
      } else {
        cancelHoldTimer();
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
      cancelHoldTimer();
    }
  }, [isAtTop, pullThreshold, startHoldTimer, cancelHoldTimer]);

  const handleMouseUp = useCallback(() => {
    // Cancel timer on release - refresh only triggers if timer completed
    cancelHoldTimer();
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
  }, [cancelHoldTimer]);

  const handleMouseLeave = useCallback(() => {
    if (isPulling) {
      cancelHoldTimer();
      setPullDistance(0);
      setIsPulling(false);
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
    }
  }, [isPulling, cancelHoldTimer]);

  // Track hover state over container for wheel events
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const handleMouseEnter = () => {
      isHoveringContainer.current = true;
    };

    const handleMouseLeaveContainer = () => {
      isHoveringContainer.current = false;
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeaveContainer);

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeaveContainer);
    };
  }, [containerRef]);

  // Wheel handler for desktop pull-to-refresh - only when hovering over container
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isRefreshing) return;
      
      // Only trigger if hovering over the feed container (or no container specified)
      if (containerRef && !isHoveringContainer.current) {
        return;
      }
      
      const atTop = isAtTop();
      
      // Only trigger on scroll up (deltaY < 0) when already at top
      if (atTop && e.deltaY < 0) {
        e.preventDefault();
        
        wheelAccumulator.current += Math.abs(e.deltaY);
        const resistedDistance = Math.min(wheelAccumulator.current * 0.3, pullThreshold * 1.5);
        setPullDistance(resistedDistance);
        setIsPulling(true);
        
        if (wheelTimeout.current) {
          clearTimeout(wheelTimeout.current);
        }
        
        // Start hold timer when threshold is reached (for wheel)
        if (resistedDistance >= pullThreshold) {
          startHoldTimer();
          // Keep checking while wheel is active
          wheelTimeout.current = setTimeout(() => {
            // If user stops scrolling before timer completes, cancel
            if (!hasTriggeredRef.current) {
              cancelHoldTimer();
            }
            wheelAccumulator.current = 0;
            setPullDistance(0);
            setIsPulling(false);
          }, 500); // Give more time for wheel-based hold
        } else {
          cancelHoldTimer();
          wheelTimeout.current = setTimeout(() => {
            wheelAccumulator.current = 0;
            setPullDistance(0);
            setIsPulling(false);
          }, 300);
        }
      } else {
        // Not at top or scrolling down - reset
        wheelAccumulator.current = 0;
        cancelHoldTimer();
        if (isPulling && !isRefreshing) {
          setPullDistance(0);
          setIsPulling(false);
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (wheelTimeout.current) {
        clearTimeout(wheelTimeout.current);
      }
    };
  }, [isPulling, isRefreshing, pullThreshold, isAtTop, containerRef, startHoldTimer, cancelHoldTimer]);

  return {
    pullDistance,
    isPulling,
    isHoldingAtThreshold,
    holdProgress,
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
