import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Hook that manages a floating overlay indicator for tab rows.
 * The indicator is rendered in an overflow-visible layer ABOVE the
 * scroll container so spring animations are never clipped.
 */
export function useTabIndicator<T extends string>(
  activeTab: T,
  layoutShiftKey?: string | number | boolean,
  isDraggingRef?: RefObject<boolean>,
  shrinkWidthByPercent: number = 0,
) {
  const layerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<T, HTMLElement | null>>>({});
  const trackingRafRef = useRef<number | null>(null);
  const initialTabRef = useRef<T>(activeTab);
  const hasMountedRef = useRef(false);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });
  const shrinkFactor = 1 - shrinkWidthByPercent / 100;


  const update = useCallback(() => {
    const layer = layerRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!layer || !btn) return;

    const lr = layer.getBoundingClientRect();
    // Skip update when container is hidden (e.g. PersistentPageCache hides pages
    // with height:0 + visibility:hidden — getBoundingClientRect returns corrupted values)
    if (lr.width === 0 && lr.height === 0) return;

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
    const prev = buttonRefs.current[key];
    buttonRefs.current[key] = el;
    if (el && !prev) {
      requestAnimationFrame(update);
    }
  }, [update]);

  // Single layout update on mount and whenever activeTab changes.
  // Skip during drag — drag controls the indicator position directly via DOM,
  // and calling update() here would make GlassIndicator jump to the new tab's
  // position mid-drag, fighting the imperative transform.
  useLayoutEffect(() => {
    if (isDraggingRef?.current) return;
    update();
  }, [update, isDraggingRef]);

  // Only track for duration AFTER user switches tabs (not on initial mount)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      // On mount, just do a single delayed update instead of 700ms polling
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(update);
      });
      return () => cancelAnimationFrame(raf);
    }
    // Skip polling during drag — drag controls indicator position directly via DOM.
    // When activeTab changes mid-drag (boundary crossing), we don't want the RAF loop
    // fighting our imperative transform updates.
    if (isDraggingRef?.current) { stopTracking(); return; }
    // User switched tabs or layout shifted — track to stay synced
    trackForDuration(700);
    return stopTracking;
  }, [activeTab, layoutShiftKey, trackForDuration, stopTracking, update]);

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

