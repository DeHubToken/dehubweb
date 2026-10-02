import { useCallback, useEffect, useRef, useState, type RefObject, type TouchEvent, type MouseEvent } from 'react';

interface UsePullToRefreshOptions {
  /** Opt in on the phone feed; other surfaces retain their existing behaviour. */
  enabled?: boolean;
  pullThreshold?: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  containerRef?: RefObject<HTMLElement>;
}

export function usePullToRefresh({ enabled = false, pullThreshold = 80, onRefresh, isRefreshing, containerRef }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);
  const reset = useCallback(() => { start.current = null; distance.current = 0; setPullDistance(0); }, []);
  useEffect(() => { if (!enabled || isRefreshing) reset(); }, [enabled, isRefreshing, reset]);
  const begin = useCallback((x: number, y: number, target: EventTarget | null) => {
    if (!enabled || isRefreshing || !(target instanceof Element)) return;
    if (target.closest('button, a, input, textarea, select, [role="slider"], [data-no-swipe]')) return;
    // Every scroll surface must be at its top; a pull inside a scrolled panel
    // belongs to that panel, rather than refreshing the feed behind it.
    if (window.scrollY > 0 || document.documentElement.scrollTop > 0 || document.body.scrollTop > 0) return;
    let node: Element | null = target;
    while (node) { if (node.scrollTop > 0) return; node = node.parentElement; }
    if (containerRef?.current && !containerRef.current.contains(target)) return;
    start.current = { x, y };
  }, [enabled, isRefreshing, containerRef]);
  const move = useCallback((x: number, y: number) => {
    const origin = start.current;
    if (!origin) return;
    const dx = x - origin.x, dy = y - origin.y;
    if (Math.abs(dx) > Math.max(12, Math.abs(dy))) { reset(); return; }
    distance.current = Math.min(pullThreshold * 1.25, Math.max(0, dy * 0.5));
    setPullDistance(distance.current);
  }, [pullThreshold, reset]);
  const finish = useCallback(() => {
    const refresh = start.current !== null && distance.current >= pullThreshold;
    reset();
    if (refresh && !isRefreshing) onRefresh();
  }, [reset, pullThreshold, isRefreshing, onRefresh]);
  return {
    pullDistance,
    isPulling: pullDistance > 0,
    isHoldingAtThreshold: false,
    holdProgress: 0,
    handlers: {
      onTouchStart: (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); else reset(); },
      onTouchMove: (e: TouchEvent) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY); else reset(); },
      onTouchEnd: finish,
      onTouchCancel: reset,
      onMouseDown: (e: MouseEvent) => { if (e.button === 0) begin(e.clientX, e.clientY, e.target); },
      onMouseMove: (e: MouseEvent) => { if (e.buttons === 1) move(e.clientX, e.clientY); },
      onMouseUp: finish,
      onMouseLeave: reset,
    },
  };
}
