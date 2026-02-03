/**
 * Pull-to-Refresh Hook
 * ====================
 * Reusable hook for implementing pull-to-refresh functionality.
 * Supports touch gestures only (wheel/trackpad disabled to prevent accidental triggers).
 * Only triggers when interacting within the specified container.
 * 
 * IMPORTANT: Uses velocity-based detection + hold-to-refresh mechanism.
 * - Fast scrolls are ignored (velocity too high)
 * - Only slow, deliberate pulls start the hold timer
 * - User must hold at threshold for HOLD_DURATION_MS before refresh triggers
 * 
 * @module hooks/use-pull-to-refresh
 */

import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

const DEFAULT_PULL_THRESHOLD = 80;
const HOLD_DURATION_MS = 420; // Time to hold at threshold before triggering
const MAX_VELOCITY_FOR_REFRESH = 0.4; // pixels per millisecond - stricter threshold for deliberate pulls only

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
  
  // Hold timer refs
  const holdStartTime = useRef<number | null>(null);
  const holdAnimationFrame = useRef<number | null>(null);
  const holdTimerActive = useRef<boolean>(false);
  
  // Velocity tracking refs - use RAW touch coordinates, not resisted distance
  const lastRawTouchY = useRef<number>(0);
  const lastPullTime = useRef<number>(0);
  const currentVelocity = useRef<number>(0);
  
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

  // Start the hold timer when threshold is reached AND velocity is low
  const startHoldTimer = useCallback(() => {
    // Don't start if already triggered or refreshing
    if (hasTriggeredRef.current || isRefreshing) return;
    
    // If timer already active, let it continue (velocity check happens in move handler)
    if (holdTimerActive.current) return;
    
    holdTimerActive.current = true;
    holdStartTime.current = Date.now();
    setIsHoldingAtThreshold(true);
    
    const updateProgress = () => {
      if (!holdTimerActive.current || !holdStartTime.current) return;
      
      // RE-CHECK velocity on each frame - cancel if user speeds up
      if (currentVelocity.current >= MAX_VELOCITY_FOR_REFRESH) {
        console.log('[PTR] Timer cancelled - velocity too high:', currentVelocity.current);
        cancelHoldTimer();
        return;
      }
      
      const elapsed = Date.now() - holdStartTime.current;
      const progress = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setHoldProgress(progress);
      
      if (progress >= 1) {
        // Timer complete - trigger refresh
        console.log('[PTR] Timer complete - triggering refresh');
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

  // Reset velocity tracking
  const resetVelocityTracking = useCallback(() => {
    lastRawTouchY.current = 0;
    lastPullTime.current = 0;
    currentVelocity.current = 0;
  }, []);

  // Update velocity using RAW touch coordinates (not resisted/capped distance)
  // This ensures fast swipes register as fast even when visual indicator is capped
  const updateVelocity = useCallback((rawTouchY: number) => {
    const now = Date.now();
    const timeDelta = now - lastPullTime.current;
    
    // Only calculate if we have a previous sample and reasonable time passed
    if (timeDelta > 10 && lastPullTime.current > 0) {
      // Use RAW touch delta - a 300px swipe should register as fast
      const rawDelta = Math.abs(rawTouchY - lastRawTouchY.current);
      const velocity = rawDelta / timeDelta;
      
      // Use exponential moving average to smooth velocity (prevents single-frame spikes/dips)
      currentVelocity.current = currentVelocity.current === 0 
        ? velocity 
        : currentVelocity.current * 0.3 + velocity * 0.7;
      
      console.log('[PTR] Velocity:', currentVelocity.current.toFixed(3), 'px/ms, threshold:', MAX_VELOCITY_FOR_REFRESH);
    }
    
    lastRawTouchY.current = rawTouchY;
    lastPullTime.current = now;
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow pull-to-refresh if we're at the very top when touch starts
    wasAtTopOnStart.current = isAtTop();
    if (wasAtTopOnStart.current) {
      const startY = e.touches[0].clientY;
      pullStartY.current = startY;
      // Initialize raw touch tracking for velocity calculation
      lastRawTouchY.current = startY;
      lastPullTime.current = Date.now();
      currentVelocity.current = 0;
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
      resetVelocityTracking();
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY.current;
    
    // Only start pulling if moving downward
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
      
      // Update velocity using RAW touch position (not resisted distance)
      // This ensures fast swipes are detected correctly
      updateVelocity(currentY);
      
      // Only start hold timer if:
      // 1. At threshold
      // 2. Velocity is LOW (user is pulling slowly/deliberately)
      if (resistedDistance >= pullThreshold && currentVelocity.current < MAX_VELOCITY_FOR_REFRESH) {
        startHoldTimer();
      } else if (resistedDistance < pullThreshold || currentVelocity.current >= MAX_VELOCITY_FOR_REFRESH) {
        // Either below threshold OR moving too fast - cancel timer
        cancelHoldTimer();
      }
    } else {
      // Moving up while at top, don't show indicator
      setPullDistance(0);
      setIsPulling(false);
      cancelHoldTimer();
      resetVelocityTracking();
    }
  }, [isAtTop, pullThreshold, startHoldTimer, cancelHoldTimer, updateVelocity, resetVelocityTracking]);

  const handleTouchEnd = useCallback(() => {
    // Cancel timer on release - refresh only triggers if timer completed
    cancelHoldTimer();
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
    resetVelocityTracking();
  }, [cancelHoldTimer, resetVelocityTracking]);

  // Mouse handlers for desktop (drag-based, not wheel)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    wasAtTopOnStart.current = isAtTop();
    if (wasAtTopOnStart.current) {
      const startY = e.clientY;
      pullStartY.current = startY;
      // Initialize raw position tracking for velocity calculation
      lastRawTouchY.current = startY;
      lastPullTime.current = Date.now();
      currentVelocity.current = 0;
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
      resetVelocityTracking();
      return;
    }

    const currentY = e.clientY;
    const distance = currentY - pullStartY.current;
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
      setIsPulling(true);
      
      // Update velocity using RAW mouse position (not resisted distance)
      updateVelocity(currentY);
      
      // Only start hold timer if at threshold AND moving slowly
      if (resistedDistance >= pullThreshold && currentVelocity.current < MAX_VELOCITY_FOR_REFRESH) {
        startHoldTimer();
      } else if (resistedDistance < pullThreshold || currentVelocity.current >= MAX_VELOCITY_FOR_REFRESH) {
        cancelHoldTimer();
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
      cancelHoldTimer();
      resetVelocityTracking();
    }
  }, [isAtTop, pullThreshold, startHoldTimer, cancelHoldTimer, updateVelocity, resetVelocityTracking]);

  const handleMouseUp = useCallback(() => {
    // Cancel timer on release - refresh only triggers if timer completed
    cancelHoldTimer();
    
    setPullDistance(0);
    setIsPulling(false);
    pullStartY.current = null;
    wasAtTopOnStart.current = false;
    resetVelocityTracking();
  }, [cancelHoldTimer, resetVelocityTracking]);

  const handleMouseLeave = useCallback(() => {
    if (isPulling) {
      cancelHoldTimer();
      setPullDistance(0);
      setIsPulling(false);
      pullStartY.current = null;
      wasAtTopOnStart.current = false;
      resetVelocityTracking();
    }
  }, [isPulling, cancelHoldTimer, resetVelocityTracking]);

  // NOTE: Wheel/trackpad-based pull-to-refresh is intentionally DISABLED
  // Trackpad inertia causes rapid wheel events that defeat the hold timer,
  // making it impossible to distinguish between "scroll to top" and "pull to refresh"
  // Pull-to-refresh now only works with touch gestures and mouse drag

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
