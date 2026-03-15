import { useEffect, useRef } from 'react';

interface GlassIndicatorProps {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  borderRadius?: string;
  className?: string;
  /** When provided, changing this key instantly re-mounts the indicator (no transition) */
  layoutKey?: string;
  /** Explicitly enable smooth transitions (set true only on user-initiated tab clicks) */
  enableTransition?: boolean;
}

const GLASS_CLASSES = 'pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';

// Cache indicator positions so returning to a page renders instantly
const positionCache = new Map<string, { x: number; y: number; width: number; height: number }>();

/**
 * Glass tab indicator.
 *
 * Renders instantly at correct position on page load with NO animation.
 * Smooth CSS transition only activates when parent explicitly enables it
 * (i.e. user clicked a different tab). Caches positions per layoutKey so
 * navigating back never animates.
 */
export function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey, enableTransition = false }: GlassIndicatorProps) {
  // Cache every stable rect position
  const prevLayoutKeyRef = useRef(layoutKey);

  useEffect(() => {
    if (rect.ready && layoutKey) {
      positionCache.set(layoutKey, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }, [rect.x, rect.y, rect.width, rect.height, rect.ready, layoutKey]);

  // Suppress transition for one frame after layoutKey changes
  const suppressTransition = prevLayoutKeyRef.current !== layoutKey;
  useEffect(() => {
    prevLayoutKeyRef.current = layoutKey;
  }, [layoutKey]);

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

  const shouldAnimate = enableTransition && !suppressTransition;

  return (
    <div
      className={`${GLASS_CLASSES} ${className ?? ''}`}
      style={{
        borderRadius,
        transform: `translate(${displayRect.x}px, ${displayRect.y}px)`,
        width: displayRect.width,
        height: displayRect.height,
        transition: shouldAnimate ? SMOOTH_TRANSITION : 'none',
        willChange: shouldAnimate ? 'transform, width' : 'auto',
      }}
    />
  );
}
