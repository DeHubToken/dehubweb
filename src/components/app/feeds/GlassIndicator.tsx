import { useState, useEffect, useRef } from 'react';

interface GlassIndicatorProps {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  borderRadius?: string;
  className?: string;
  /** When provided, changing this key instantly re-mounts the indicator (no transition) */
  layoutKey?: string;
}

const GLASS_CLASSES = 'pointer-events-none absolute bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]';

export function GlassIndicator({ rect, borderRadius = '0.75rem', className, layoutKey }: GlassIndicatorProps) {
  const prevRectRef = useRef<{ x: number; width: number } | null>(null);
  const [userHasSwitched, setUserHasSwitched] = useState(false);
  const suppressedRef = useRef(false);

  // Detect user-initiated tab switch (significant x/width change after initial render)
  useEffect(() => {
    if (!rect.ready) return;

    if (!prevRectRef.current) {
      prevRectRef.current = { x: rect.x, width: rect.width };
      return;
    }

    const prev = prevRectRef.current;
    if (Math.abs(rect.x - prev.x) > 5 || Math.abs(rect.width - prev.width) > 5) {
      if (!suppressedRef.current) {
        setUserHasSwitched(true);
      }
    }
    prevRectRef.current = { x: rect.x, width: rect.width };
  }, [rect.x, rect.width, rect.ready]);

  // Reset on layoutKey change — suppress transitions for 300ms
  useEffect(() => {
    prevRectRef.current = null;
    setUserHasSwitched(false);
    suppressedRef.current = true;
    const timer = setTimeout(() => { suppressedRef.current = false; }, 300);
    return () => clearTimeout(timer);
  }, [layoutKey]);

  if (!rect.ready) return null;

  const useTransition = userHasSwitched && !suppressedRef.current;

  return (
    <div
      className={`${GLASS_CLASSES} ${className ?? ''}`}
      style={{
        borderRadius,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: rect.width,
        height: rect.height,
        transition: useTransition
          ? 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
          : 'none',
      }}
    />
  );
}
