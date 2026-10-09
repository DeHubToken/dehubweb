import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Observe the active tab's existing drag handle without taking over its gesture. */
export function useTabLongPress(activeTab: string, onLongPress: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  }, []);
  useEffect(() => {
    // A second finger, lost focus, navigation or unmount must never open a menu.
    const additionalPointer = (event: PointerEvent) => { if (!event.isPrimary) cancel(); };
    window.addEventListener('pointerdown', additionalPointer);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('pointerdown', additionalPointer);
      window.removeEventListener('blur', cancel);
    };
  }, [activeTab, enabled, cancel]);
  const begin = useCallback((event: ReactPointerEvent) => {
    cancel();
    fired.current = false;
    if (!enabled || event.pointerType !== 'touch' || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    timer.current = setTimeout(() => {
      fired.current = true;
      cancel();
      callback.current();
    }, 500);
  }, [enabled, cancel]);
  const move = useCallback((event: ReactPointerEvent) => {
    const origin = start.current;
    if (origin && (event.pointerId !== origin.id || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5)) cancel();
  }, [cancel]);
  return { begin, move, cancel, fired };
}
