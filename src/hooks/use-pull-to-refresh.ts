import { useCallback, useEffect, useRef, useState, type RefObject, type TouchEvent, type MouseEvent } from 'react';
import { PULL_CANCEL_MS, PULL_RETURN_MS, pullForDrag, pullSpringProgress } from '@/lib/pill-pull-motion';

interface UsePullToRefreshOptions {
  /** Opt in on the phone feed; other surfaces retain their existing behaviour. */
  enabled?: boolean;
  pullThreshold?: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  containerRef?: RefObject<HTMLElement>;
  /** Isolate feed motion from the page's React render and data refresh work. */
  motionRef?: RefObject<HTMLElement>;
  onMotion?: (distance: number, pulling: boolean) => void;
}

export function usePullToRefresh({ enabled = false, pullThreshold = 80, onRefresh, isRefreshing, containerRef, motionRef, onMotion }: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);
  const frame = useRef(0);
  const returning = useRef(false);
  const animation = useRef<Animation | null>(null);
  const motion = useRef({ motionRef, onMotion });
  motion.current = { motionRef, onMotion };
  const publish = useCallback((value: number, pulling: boolean) => {
    const node = motion.current.motionRef?.current;
    if (node && !animation.current) {
      node.style.transform = value !== 0 ? `translate3d(0, ${value}px, 0)` : '';
      node.style.willChange = value !== 0 ? 'transform' : '';
    }
    if (motion.current.onMotion) motion.current.onMotion(value, pulling);
    else setPullDistance(value);
  }, []);
  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    animation.current?.cancel(); animation.current = null;
    returning.current = false;
    start.current = null; distance.current = 0;
    setIsPulling(false); publish(0, false);
  }, [publish]);
  const springBack = useCallback((duration = PULL_RETURN_MS) => {
    start.current = null; setIsPulling(false);
    cancelAnimationFrame(frame.current);
    const from = distance.current;
    if (from <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { reset(); return; }
    returning.current = true;
    const node = motion.current.motionRef?.current;
    // The compositor can finish the return even when fresh cards occupy JS.
    if (node?.animate) {
      animation.current?.cancel();
      node.style.transform = '';
      animation.current = node.animate(Array.from({ length: 61 }, (_, i) => ({
        transform: `translate3d(0, ${from * (1 - pullSpringProgress(i / 60))}px, 0)`,
        offset: i / 60,
      })), { duration, easing: 'linear' });
    }
    const began = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - began) / duration);
      distance.current = from * (1 - pullSpringProgress(p));
      // The spring passes rest once; finish the invisible tail after that
      // instead of repainting subpixel movement.
      if (p === 1 || (p > .75 && Math.abs(distance.current) < 0.5)) { reset(); return; }
      publish(distance.current, false);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [reset, publish]);
  useEffect(() => {
    if (!enabled) reset();
    else if (isRefreshing && start.current) springBack();
  }, [enabled, isRefreshing, reset, springBack]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); animation.current?.cancel(); }, []);
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
    if (!motion.current.onMotion) setIsPulling(true);
    publish(0, true);
  }, [enabled, isRefreshing, containerRef, publish]);
  const move = useCallback((x: number, y: number) => {
    const origin = start.current;
    if (!origin) return;
    const dx = x - origin.x, dy = y - origin.y;
    if (Math.abs(dx) > Math.max(12, Math.abs(dy))) { reset(); return; }
    distance.current = pullForDrag(dy);
    publish(distance.current, true);
  }, [reset, publish]);
  const finish = useCallback(() => {
    if (!start.current) return;
    const refresh = start.current !== null && distance.current >= pullThreshold;
    springBack(refresh ? PULL_RETURN_MS : PULL_CANCEL_MS);
    if (refresh && !isRefreshing) onRefresh();
  }, [springBack, pullThreshold, isRefreshing, onRefresh]);
  const cancel = useCallback(() => { if (start.current) springBack(PULL_CANCEL_MS); }, [springBack]);
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
