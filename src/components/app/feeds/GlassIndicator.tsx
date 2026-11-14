import { useEffect, forwardRef } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

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
  /** Marks the primary feed-nav indicator for theme-specific chrome. */
  variant?: 'nav';
}

const GLASS_CLASSES = 'pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30';

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
  function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey, enableTransition = false, fixedHeightPx, variant }, ref) {
  const { theme, themeChoice } = useAppTheme();
  const isLightTheme = (theme === 'light' || themeChoice === 'system-light');
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

  // Land the pill on whole screen pixels. Tab rows split their width
  // evenly, so the measured rect is usually fractional (e.g. x 365.77,
  // width 105.28) and centring a 35px pill in a 36px row adds another half
  // pixel. A transform is never pixel-snapped by the browser, so at 100% zoom
  // the 1px rim and its rounded corners were smeared across two pixels and
  // read as jagged. Snapping to device pixels keeps them crisp at any zoom.
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  // A pinned height is centred with an equal gap above and below, rounded
  // up to a whole device pixel (a 35px pill in a 36px row stays 35px on a
  // 2x screen and becomes 34px with a 1px gap each side at 100%).
  const left = snap(displayRect.x);
  const right = snap(displayRect.x + displayRect.width);
  const rowTop = snap(displayRect.y);
  const rowHeight = snap(displayRect.y + displayRect.height) - rowTop;
  const rawGap = fixedHeightPx != null ? (rowHeight - fixedHeightPx) / 2 : 0;
  const gap = rawGap > 0 ? Math.ceil(rawGap * dpr - 0.001) / dpr : snap(rawGap);
  const displayY = rowTop + gap;
  const displayHeight = fixedHeightPx != null ? rowHeight - gap * 2 : rowHeight;

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
      data-theme-control-surface
      data-feed-nav-indicator={variant === 'nav' ? '' : undefined}
      className={cn(
        GLASS_CLASSES,
        isLightTheme
          ? "shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.05)]"
          : "shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
        className
      )}
      style={{
        borderRadius,
        transform: `translate(${left}px, ${displayY}px)`,
        width: right - left,
        height: displayHeight,
        transition: enableTransition ? SMOOTH_TRANSITION : 'none',
        willChange: enableTransition ? 'transform, width' : 'auto',
      }}
    />
  );
});
