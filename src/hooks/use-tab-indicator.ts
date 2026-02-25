import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

/**
 * Hook that manages a floating overlay indicator for tab rows.
 * The indicator is rendered in an overflow-visible layer ABOVE the
 * scroll container so spring animations are never clipped.
 */
export function useTabIndicator<T extends string>(activeTab: T) {
  const layerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<T, HTMLElement | null>>>({});
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });

  const update = useCallback(() => {
    const layer = layerRef.current;
    const btn = buttonRefs.current[activeTab];
    if (!layer || !btn) return;
    const lr = layer.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setRect({
      x: br.left - lr.left,
      y: br.top - lr.top,
      width: br.width,
      height: br.height,
      ready: true,
    });
  }, [activeTab]);

  const onScroll = useCallback(() => {
    requestAnimationFrame(update);
  }, [update]);

  const setRef = useCallback((key: T) => (el: HTMLElement | null) => {
    buttonRefs.current[key] = el;
  }, []);

  useLayoutEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    const handler = () => requestAnimationFrame(update);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [update]);

  return { layerRef, setRef, rect, onScroll };
}
