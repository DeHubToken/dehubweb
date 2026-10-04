import { useCallback, useEffect, useRef, useState, type RefObject, type TouchEvent, type MouseEvent } from 'react';
import { PULL_RETURN_MS, pullForDrag, pullSpringProgress } from '@/lib/pill-pull-motion';

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
  const [isPulling, setIsPulling] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);
  const frame = useRef(0);
  const returning = useRef(false);
  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    returning.current = false;
    start.current = null; distance.current = 0;
    setIsPulling(false); setPullDistance(0);
  }, []);
  const springBack = useCallback((duration = PULL_RETURN_MS) => {
    start.current = null; setIsPulling(false);
    cancelAnimationFrame(frame.current);
    const from = distance.current;
    if (from <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { reset(); return; }
    returning.current = true;
    const began = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - began) / duration);
      distance.current = from * (1 - pullSpringProgress(p));
      setPullDistance(distance.current);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else returning.current = false;
    };
    frame.current = requestAnimationFrame(tick);
  }, [reset]);
  useEffect(() => {
    if (!enabled) reset();
    else if (isRefreshing && start.current) springBack();
  }, [enabled, isRefreshing, reset, springBack]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const begin = useCallback((x: number, y: number, target: EventTarget | null) => {
    if (!enabled || isRefreshing || returning.current || !(target instanceof Element)) return;
    if (target.closest('button, a, input, textarea, select, [role="slider"], [data-no-pull], [data-feed-filter-panel]')) return;
    // Every scroll surface must be at its top; a pull inside a scrolled panel
    // belongs to that panel, rather than refreshing the feed behind it.
    if (window.scrollY > 0 || document.documentElement.scrollTop > 0 || document.body.scrollTop > 0) return;
    let node: Element | null = target;
    while (node) { if (node.scrollTop > 0) return; node = node.parentElement; }
    if (containerRef?.current && !containerRef.current.contains(target)) return;
    start.current = { x, y };
    setIsPulling(true);
  }, [enabled, isRefreshing, containerRef]);
  const move = useCallback((x: number, y: number) => {
    const origin = start.current;
    if (!origin) return;
    const dx = x - origin.x, dy = y - origin.y;
    if (Math.abs(dx) > Math.max(12, Math.abs(dy))) { reset(); return; }
    distance.current = pullForDrag(dy);
    setPullDistance(distance.current);
  }, [reset]);
  const finish = useCallback(() => {
    if (!start.current) return;
    const refresh = start.current !== null && distance.current >= pullThreshold;
    springBack(refresh ? PULL_RETURN_MS : 1000);
    if (refresh && !isRefreshing) onRefresh();
  }, [springBack, pullThreshold, isRefreshing, onRefresh]);
  const cancel = useCallback(() => { if (start.current) springBack(1000); }, [springBack]);
  useEffect(() => {
    const container = containerRef?.current;
    if (!enabled || !container) return;
    // React's delegated touchmove listener is passive. Claim a downward pull
    // before the browser starts scrolling and cancels the custom gesture.
    const claimPull = (event: globalThis.TouchEvent) => {
      const origin = start.current;
      if (!origin || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - origin.x, dy = touch.clientY - origin.y;
      if (Math.abs(dx) > Math.max(12, Math.abs(dy))) { reset(); return; }
      if (dy > 0 && dy > Math.abs(dx) && event.cancelable) event.preventDefault();
    };
    container.addEventListener('touchmove', claimPull, { passive: false, capture: true });
    return () => container.removeEventListener('touchmove', claimPull, true);
  }, [enabled, containerRef, reset]);
  return {
    pullDistance,
    isPulling,
    isHoldingAtThreshold: false,
    holdProgress: 0,
    handlers: {
      onTouchStart: (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); else reset(); },
      onTouchMove: (e: TouchEvent) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY); else reset(); },
      onTouchEnd: finish,
      onTouchCancel: cancel,
      onMouseDown: (e: MouseEvent) => {
        if (e.button !== 0) return;
        begin(e.clientX, e.clientY, e.target);
        if (start.current) e.preventDefault();
      },
      onMouseMove: (e: MouseEvent) => { if (e.buttons === 1) move(e.clientX, e.clientY); },
      onMouseUp: finish,
      onMouseLeave: cancel,
    },
  };
}
