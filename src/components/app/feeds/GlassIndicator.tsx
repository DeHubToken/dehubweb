import { useState, useEffect, useRef } from 'react';

interface GlassIndicatorProps {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  borderRadius?: string;
  className?: string;
  /** When provided, changing this key instantly re-mounts the indicator (no transition) */
  layoutKey?: string;
}

/**
 * Glass tab indicator.
 *
 * On initial load it renders instantly at the correct position with NO
 * animation whatsoever — preventing the ugly "stretch / slide into place"
 * glitch.  Spring animation only kicks in after the user actively switches
 * tabs (detected by a meaningful position change).
 */
export function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey }: GlassIndicatorProps) {
  const initialRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [userHasSwitched, setUserHasSwitched] = useState(false);
  const [stable, setStable] = useState(false);

  // Wait for layout to fully settle before showing anything
  useEffect(() => {
    if (!rect.ready) return;

    // Delay rendering by 2 frames so the DOM is fully laid out
    let raf1: number;
    let raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setStable(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [rect.ready]);

  useEffect(() => {
    if (!rect.ready || !stable) return;

    if (!initialRectRef.current) {
      initialRectRef.current = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      return;
    }

    // Detect an actual tab switch (significant position change)
    const init = initialRectRef.current;
    if (Math.abs(rect.x - init.x) > 2 || Math.abs(rect.width - init.width) > 2) {
      setUserHasSwitched(true);
    }
  }, [rect, stable]);

  // Reset on layoutKey change
  useEffect(() => {
    initialRectRef.current = null;
    setUserHasSwitched(false);
    setStable(false);
  }, [layoutKey]);

  if (!rect.ready || !stable) return null;

  // Before user has switched: render a plain div (no framer-motion, no animation)
  if (!userHasSwitched) {
    return (
      <div
        className={`pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] ${className ?? ''}`}
        style={{
          borderRadius,
          transform: `translate(${rect.x}px, ${rect.y}px)`,
          width: rect.width,
          height: rect.height,
        }}
      />
    );
  }

  // After user has switched: use spring animation
  // Inline dynamic import would be messy, so we use CSS transitions instead
  return (
    <div
      className={`pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] ${className ?? ''}`}
      style={{
        borderRadius,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: rect.width,
        height: rect.height,
        transition: 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    />
  );
}
