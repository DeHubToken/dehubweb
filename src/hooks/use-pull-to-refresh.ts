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
  /** True when user just arrived at top - show bounce indicator */
  showTopBounce: boolean;
  /** True when user can now pull to refresh (after bounce) */
  canRefresh: boolean;
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
  const [showTopBounce, setShowTopBounce] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);
  
  const pullStartY = useRef<number | null>(null);
  const wheelAccumulator = useRef<number>(0);
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastScrollY = useRef<number>(0);
  const gestureEnded = useRef<boolean>(true);
  const bounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Helper to check if we're truly at the top
  const isAtTop = useCallback(() => {
    const scrollTop = Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop
    );
    return scrollTop <= 2;
  }, []);

  // Track scroll to detect when user ARRIVES at top
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop
      );
      const wasScrollingDown = currentScrollY < lastScrollY.current;
      const atTop = currentScrollY <= 2;
      
      // User just arrived at top from scrolling up
      if (atTop && wasScrollingDown && lastScrollY.current > 10) {
        // Show bounce animation
        setShowTopBounce(true);
        setCanRefresh(false);
        
        // After bounce animation, enable refresh capability
        if (bounceTimeout.current) clearTimeout(bounceTimeout.current);
        bounceTimeout.current = setTimeout(() => {
          setShowTopBounce(false);
          setCanRefresh(true);
        }, 600);
      }
      
      // If user scrolls away from top, reset everything
      if (!atTop) {
        setCanRefresh(false);
        setShowTopBounce(false);
        if (bounceTimeout.current) {
          clearTimeout(bounceTimeout.current);
          bounceTimeout.current = null;
        }
      }
      
      lastScrollY.current = currentScrollY;
    };
    
    // Check on mount - if already at top, allow refresh
    if (isAtTop()) {
      setCanRefresh(true);
    }
    lastScrollY.current = Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop
    );
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (bounceTimeout.current) clearTimeout(bounceTimeout.current);
    };
  }, [isAtTop]);

  // Trigger the refresh
  const triggerRefresh = useCallback(() => {
    if (!isRefreshing) {
      onRefresh();
      // After refresh, reset canRefresh so user needs to do the bounce again
      setCanRefresh(false);
    }
  }, [isRefreshing, onRefresh]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    gestureEnded.current = false;
    // Only allow if canRefresh is true (after bounce or already at top)
    if (canRefresh && isAtTop()) {
      pullStartY.current = e.touches[0].clientY;
    } else {
      pullStartY.current = null;
    }
  }, [isAtTop, canRefresh]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current === null) return;
    if (!isAtTop()) {
      pullStartY.current = null;
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY.current;
    
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isAtTop, pullThreshold]);

  const handleTouchEnd = useCallback(() => {
    gestureEnded.current = true;
    if (isPulling && pullDistance >= pullThreshold && canRefresh) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh, canRefresh]);

  // Mouse handlers for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    gestureEnded.current = false;
    if (canRefresh && isAtTop()) {
      pullStartY.current = e.clientY;
    } else {
      pullStartY.current = null;
    }
  }, [isAtTop, canRefresh]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (pullStartY.current === null) return;
    if (!isAtTop()) {
      pullStartY.current = null;
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
    gestureEnded.current = true;
    if (isPulling && pullDistance >= pullThreshold && canRefresh) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh, canRefresh]);

  const handleMouseLeave = useCallback(() => {
    if (isPulling) {
      setPullDistance(0);
      setIsPulling(false);
      pullStartY.current = null;
    }
  }, [isPulling]);

  // Wheel handler for desktop pull-to-refresh
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isRefreshing) return;
      
      // Only trigger if canRefresh is true and at top
      if (canRefresh && isAtTop() && e.deltaY < 0) {
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
  }, [isPulling, isRefreshing, pullThreshold, triggerRefresh, isAtTop, canRefresh]);

  return {
    pullDistance,
    isPulling,
    showTopBounce,
    canRefresh,
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
