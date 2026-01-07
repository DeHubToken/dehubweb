/**
 * Pull-to-Refresh Hook
 * ====================
 * Reusable hook for implementing pull-to-refresh functionality.
 * Supports touch, mouse, and wheel gestures.
 * 
 * @module hooks/use-pull-to-refresh
 */

import { useState, useRef, useEffect, useCallback } from 'react';

const DEFAULT_PULL_THRESHOLD = 80;

interface UsePullToRefreshOptions {
  /** Distance required to trigger refresh */
  pullThreshold?: number;
  /** Callback when refresh is triggered */
  onRefresh: () => void;
  /** Whether refresh is currently in progress */
  isRefreshing: boolean;
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
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const wasAtTopOnStart = useRef<boolean>(false);
  const wheelAccumulator = useRef<number>(0);
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTop = useRef<number>(0);

  // Helper to check if we're truly at the top
  const isAtTop = useCallback(() => {
    const scrollTop = Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop
    );
    return scrollTop <= 2;
  }, []);

  // Trigger the refresh
  const triggerRefresh = useCallback(() => {
    if (!isRefreshing) {
      onRefresh();
    }
  }, [isRefreshing, onRefresh]);

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
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY.current;
    
    // Only start pulling if moving downward
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
    } else {
      // Moving up while at top, don't show indicator
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isAtTop, pullThreshold]);

  const handleTouchEnd = useCallback(() => {
    if (isPulling && pullDistance >= pullThreshold && wasAtTopOnStart.current) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh]);

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
      return;
    }

    const distance = e.clientY - pullStartY.current;
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isAtTop, pullThreshold]);

  const handleMouseUp = useCallback(() => {
    if (isPulling && pullDistance >= pullThreshold && wasAtTopOnStart.current) {
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

  // Wheel handler for desktop pull-to-refresh
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isRefreshing) return;
      
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
        
        if (resistedDistance >= pullThreshold) {
          triggerRefresh();
          wheelAccumulator.current = 0;
          setPullDistance(0);
          setIsPulling(false);
        } else {
          wheelTimeout.current = setTimeout(() => {
            wheelAccumulator.current = 0;
            setPullDistance(0);
            setIsPulling(false);
          }, 300);
        }
      } else {
        // Not at top or scrolling down - reset
        wheelAccumulator.current = 0;
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
  }, [isPulling, isRefreshing, pullThreshold, triggerRefresh, isAtTop]);

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
