import { useEffect, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

/** The scene moves as three composited layers; no canvas or per-frame React work. */
export function GlassBackground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => {
      if (ref.current) ref.current.dataset.paused = String(document.hidden || isBackgroundPaused());
    };
    sync();
    const unsubscribe = subscribeBackgroundPaused(sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return <div ref={ref} data-glass-background aria-hidden="true">
    <div data-glass-light="one" />
    <div data-glass-light="two" />
    <div data-glass-light="three" />
  </div>;
}
