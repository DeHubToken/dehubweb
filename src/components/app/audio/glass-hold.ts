import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Holding the volume or colour slider turns its handle into a clear glass
 * lens, like the iOS 26 slider (the app's iPhone slider does it natively).
 * Spread the result on the slider root or range input; glass-hold.css draws
 * the lens from `data-glass-held`, and `--glass-stretch` pulls it longer
 * the faster it is dragged.
 */
export function useGlassHold() {
  const [held, setHeld] = useState(false);
  const stop = useRef<() => void>();

  useEffect(() => () => stop.current?.(), []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    stop.current?.();
    const el = e.currentTarget;
    const stretch = (value: number) => el.style.setProperty('--glass-stretch', value.toFixed(3));
    let lastX = e.clientX;
    let lastT = performance.now();
    let settle = 0;
    const move = (ev: PointerEvent) => {
      const now = performance.now();
      const speed = Math.abs(ev.clientX - lastX) / Math.max(8, now - lastT);
      lastX = ev.clientX;
      lastT = now;
      stretch(1 + Math.min(0.35, speed * 0.25));
      window.clearTimeout(settle);
      settle = window.setTimeout(() => stretch(1), 90);
    };
    const release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.clearTimeout(settle);
      stretch(1);
      stop.current = undefined;
      setHeld(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    stop.current = release;
    setHeld(true);
  }, []);

  return { 'data-glass-hold': '', 'data-glass-held': held ? '' : undefined, onPointerDown };
}
