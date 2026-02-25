import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

/**
 * Hook that manages a floating overlay indicator for tab rows.
 * The indicator is rendered in an overflow-visible layer ABOVE the
 * scroll container so spring animations are never clipped.
 */
export function useTabIndicator<T extends string>(activeTab: T, layoutShiftKey?: string | number | boolean) {
  const layerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<T, HTMLElement | null>>>({});
  const trackingRafRef = useRef<number | null>(null);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });

  const update = useCallback(() => {
    const layer = layerRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!layer || !btn) return;

    const lr = layer.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const next = {
      x: br.left - lr.left,
      y: br.top - lr.top,
      width: br.width,
      height: br.height,
      ready: true,
    };

    setRect((prev) => (
      prev.x === next.x &&
      prev.y === next.y &&
      prev.width === next.width &&
      prev.height === next.height &&
      prev.ready === next.ready
    ) ? prev : next);
  }, [activeTab]);

  const stopTracking = useCallback(() => {
    if (trackingRafRef.current !== null) {
      cancelAnimationFrame(trackingRafRef.current);
      trackingRafRef.current = null;
    }
  }, []);

  const trackForDuration = useCallback((durationMs = 700) => {
    stopTracking();

    const start = performance.now();
    const tick = () => {
      update();
      if (performance.now() - start < durationMs) {
        trackingRafRef.current = requestAnimationFrame(tick);
      } else {
        trackingRafRef.current = null;
      }
    };

    trackingRafRef.current = requestAnimationFrame(tick);
  }, [stopTracking, update]);

  const onScroll = useCallback(() => {
    requestAnimationFrame(update);
  }, [update]);

  const setRef = useCallback((key: T) => (el: HTMLElement | null) => {
    buttonRefs.current[key] = el;
  }, []);

  useLayoutEffect(() => {
    update();
  }, [update]);

  // Keep the indicator synced while layout is animating (e.g. sidebar collapse/expand).
  useEffect(() => {
    trackForDuration(700);
    return stopTracking;
  }, [activeTab, layoutShiftKey, trackForDuration, stopTracking]);

  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(update);
      trackForDuration(350);
    };

    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [update, trackForDuration]);

  useEffect(() => {
    const layer = layerRef.current;
    const btn = buttonRefs.current[activeTab];

    if (!layer || !btn || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(update);
    });

    observer.observe(layer);
    observer.observe(btn);

    return () => observer.disconnect();
  }, [activeTab, update, layoutShiftKey]);

  return { layerRef, setRef, rect, onScroll };
}

