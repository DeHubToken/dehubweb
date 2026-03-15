import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface GlassIndicatorProps {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  borderRadius?: string;
  className?: string;
  /** When provided, changing this key instantly re-mounts the indicator (no transition) */
  layoutKey?: string;
}

/**
 * Rendered in an overflow-visible layer, this animates to the active tab's
 * position. Because it's outside the scroll container, spring bounce is
 * never clipped.
 *
 * Pass a `layoutKey` that changes on layout shifts (e.g. sidebar collapse)
 * to force a fresh mount instead of a broken transition.
 */
export function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey }: GlassIndicatorProps) {
  // Track user-initiated tab changes. Animation is disabled until the user
  // has switched tabs at least once, preventing the "stretch from origin"
  // glitch on page load / navigation.
  const initialRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [userHasSwitched, setUserHasSwitched] = useState(false);

  useEffect(() => {
    if (!rect.ready) return;

    if (!initialRectRef.current) {
      // Capture the first valid rect as the baseline
      initialRectRef.current = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      return;
    }

    // If the rect target changed significantly from the initial position,
    // the user has switched tabs — enable animations from now on
    const init = initialRectRef.current;
    if (Math.abs(rect.x - init.x) > 2 || Math.abs(rect.width - init.width) > 2) {
      setUserHasSwitched(true);
    }
  }, [rect]);

  // Reset on layoutKey change
  useEffect(() => {
    initialRectRef.current = null;
    setUserHasSwitched(false);
  }, [layoutKey]);

  if (!rect.ready) return null;

  return (
    <motion.div
      key={layoutKey}
      className={`pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] ${className ?? ''}`}
      style={{ borderRadius }}
      initial={{
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }}
      animate={{
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }}
      transition={userHasSwitched ? { type: 'spring', stiffness: 400, damping: 30 } : { duration: 0 }}
    />
  );
}
