import { useState, useEffect, useRef } from 'react';

interface GlassIndicatorProps {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  borderRadius?: string;
  className?: string;
  /** When provided, changing this key instantly re-mounts the indicator (no transition) */
  layoutKey?: string;
}

const GLASS_CLASSES = 'pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';

// Cache indicator positions so returning to a page renders instantly
const positionCache = new Map<string, { x: number; y: number; width: number; height: number }>();

/**
 * Glass tab indicator.
 *
 * Renders instantly at correct position on page load with NO animation.
 * Smooth CSS transition only activates after user actively switches tabs.
 * Caches positions per layoutKey so navigating back never animates.
 */
export function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey }: GlassIndicatorProps) {
  const prevRectRef = useRef<{ x: number; width: number } | null>(null);
  const [userHasSwitched, setUserHasSwitched] = useState(false);
  // Count how many rect updates we've absorbed after a reset before enabling transitions
  const settleCountRef = useRef(0);
  const SETTLE_THRESHOLD = 4; // absorb several layout-settling updates

  // Reset on layoutKey change — suppress transitions for settling updates
  useEffect(() => {
    prevRectRef.current = null;
    setUserHasSwitched(false);
    settleCountRef.current = 0;
  }, [layoutKey]);

  // Cache every stable rect position
  useEffect(() => {
    if (rect.ready && layoutKey) {
      positionCache.set(layoutKey, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }, [rect.x, rect.y, rect.width, rect.height, rect.ready, layoutKey]);

  // Detect user-initiated tab switch (significant x/width change after settling)
  useEffect(() => {
    if (!rect.ready) return;

    if (!prevRectRef.current) {
      prevRectRef.current = { x: rect.x, width: rect.width };
      settleCountRef.current++;
      return;
    }

    const prev = prevRectRef.current;
    const significantChange = Math.abs(rect.x - prev.x) > 5 || Math.abs(rect.width - prev.width) > 5;
    
    if (significantChange) {
      settleCountRef.current++;
      // Only enable transitions after we've settled past the threshold
      if (settleCountRef.current > SETTLE_THRESHOLD) {
        setUserHasSwitched(true);
      }
    }
    
    prevRectRef.current = { x: rect.x, width: rect.width };
  }, [rect.x, rect.width, rect.ready]);

  // Use cached position if rect isn't ready yet
  const cached = layoutKey ? positionCache.get(layoutKey) : null;
  const displayRect = rect.ready ? rect : cached ? { ...cached, ready: true } : rect;

  if (!displayRect.ready) return null;

  // Smooth spring-like easing for sexy tab transitions
  const SMOOTH_TRANSITION = [
    'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  ].join(', ');

  return (
    <div
      className={`${GLASS_CLASSES} ${className ?? ''}`}
      style={{
        borderRadius,
        transform: `translate(${displayRect.x}px, ${displayRect.y}px)`,
        width: displayRect.width,
        height: displayRect.height,
        transition: userHasSwitched ? SMOOTH_TRANSITION : 'none',
        willChange: userHasSwitched ? 'transform, width' : 'auto',
      }}
    />
  );
}
