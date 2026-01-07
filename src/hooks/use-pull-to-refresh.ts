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
  const wheelAccumulator = useRef<number>(0);
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null);

  // Trigger the refresh
  const triggerRefresh = useCallback(() => {
    if (!isRefreshing) {
      onRefresh();
    }
  }, [isRefreshing, onRefresh]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPulling && pullStartY.current !== null) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - pullStartY.current);
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
    }
  }, [isPulling, pullThreshold]);

  const handleTouchEnd = useCallback(() => {
    if (isPulling && pullDistance >= pullThreshold) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh]);

  // Mouse handlers for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0) {
      pullStartY.current = e.clientY;
      setIsPulling(true);
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPulling && pullStartY.current !== null) {
      const distance = Math.max(0, e.clientY - pullStartY.current);
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
    }
  }, [isPulling, pullThreshold]);

  const handleMouseUp = useCallback(() => {
    if (isPulling && pullDistance >= pullThreshold) {
      triggerRefresh();
    }
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
  }, [isPulling, pullDistance, pullThreshold, triggerRefresh]);

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
      
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      
      if (scrollTop <= 5 && e.deltaY < 0) {
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
      } else if (scrollTop > 5 || e.deltaY > 0) {
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
  }, [isPulling, isRefreshing, pullThreshold, triggerRefresh]);

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
