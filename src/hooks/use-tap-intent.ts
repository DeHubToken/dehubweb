import { useRef, useCallback } from 'react';

/**
 * Detects intentional taps vs scroll gestures on mobile.
 * Returns onTouchStart/onTouchEnd handlers that only fire the callback on genuine taps.
 */
export function useTapIntent(onTap: () => void, threshold = 10) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - touchStart.current.x);
    const dy = Math.abs(touch.clientY - touchStart.current.y);
    const dt = Date.now() - touchStart.current.time;
    touchStart.current = null;

    // Only fire if finger barely moved and tap was quick
    if (dx < threshold && dy < threshold && dt < 500) {
      e.stopPropagation();
      e.preventDefault();
      onTap();
    }
  }, [onTap, threshold]);

  return { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd };
}
