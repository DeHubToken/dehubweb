import { useEffect, forwardRef } from 'react';

interface GlassIndicatorProps {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  borderRadius?: string;
  className?: string;
  /** Used for position caching so returning to a page renders instantly */
  layoutKey?: string;
  /** Explicitly enable smooth transitions (set true only on user-initiated tab clicks) */
  enableTransition?: boolean;
  /**
   * Pin indicator height (px) and vertically center it inside the measured tab rect.
   * (e.g. tab row is h-9 / 36px but the glass pill should be 35px.)
   */
  fixedHeightPx?: number;
}

const GLASS_CLASSES = 'pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';

// Cache indicator positions so returning to a page renders instantly
const positionCache = new Map<string, { x: number; y: number; width: number; height: number }>();

/**
 * Glass tab indicator.
 *
 * Renders instantly at correct position on page load with NO animation.
 * Smooth CSS transition only activates when parent explicitly sets enableTransition.
 * Caches positions per layoutKey so navigating back renders at correct spot.
 * Supports forwardRef so parents can update transform directly during drag (bypassing React state).
 */
export const GlassIndicator = forwardRef<HTMLDivElement, GlassIndicatorProps>(
  function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey, enableTransition = false, fixedHeightPx }, ref) {
  // Cache every stable rect position
  useEffect(() => {
    if (rect.ready && layoutKey) {
      positionCache.set(layoutKey, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }, [rect.x, rect.y, rect.width, rect.height, rect.ready, layoutKey]);

  // Use cached position if rect isn't ready yet (always — for all indicators)
  const cached = layoutKey ? positionCache.get(layoutKey) : null;
  const displayRect = rect.ready ? rect : cached ? { ...cached, ready: true } : rect;

  if (!displayRect.ready) return null;

  const displayHeight = fixedHeightPx ?? displayRect.height;
  const displayY =
    fixedHeightPx != null
      ? displayRect.y + (displayRect.height - fixedHeightPx) / 2
      : displayRect.y;

  // Smooth spring-like easing for sexy tab transitions
  const SMOOTH_TRANSITION = [
    'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  ].join(', ');

  return (
    <div
      ref={ref}
      data-glass-indicator
      className={`${GLASS_CLASSES} ${className ?? ''}`}
      style={{
        borderRadius,
        transform: `translate(${displayRect.x}px, ${displayY}px)`,
        width: displayRect.width,
        height: displayHeight,
        transition: enableTransition ? SMOOTH_TRANSITION : 'none',
        willChange: enableTransition ? 'transform, width' : 'auto',
      }}
    />
  );
});
