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
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    />
  );
}
