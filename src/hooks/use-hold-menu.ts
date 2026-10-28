import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

const HOLD_MS = 500;
const SLOP_PX = 8;

/**
 * Open a row's menu by holding it on a touch screen, or right-clicking it with
 * a mouse. Spread the returned handlers on the row.
 *
 * iOS Safari never fires `contextmenu` on a long press, so the touch hold is
 * timed here; Android Chrome fires both, so a `contextmenu` that lands right
 * after the timer already opened the menu is swallowed. The click that ends a
 * hold is swallowed too, so letting go never also taps the row.
 */
/** Return false from onHold to leave the row alone (and keep the browser's own menu). */
export function useHoldMenu(
  onHold: (point: { x: number; y: number }, target: Element) => boolean | void,
  enabled = true,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  /** When a touch hold last opened the menu, to swallow Android's own contextmenu after it. */
  const firedAt = useRef(0);
  /** The click that ends a touch hold, if the browser sends one. */
  const swallowClick = useRef(false);
  const callback = useRef(onHold);
  callback.current = onHold;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    cancel();
    swallowClick.current = false;
    if (!enabled || event.pointerType !== 'touch' || !event.isPrimary) return;
    const point = { x: event.clientX, y: event.clientY };
    const target = event.target as Element;
    start.current = { ...point, id: event.pointerId };
    timer.current = setTimeout(() => {
      cancel();
      if (callback.current(point, target) === false) return;
      firedAt.current = Date.now();
      swallowClick.current = true;
    }, HOLD_MS);
  }, [enabled, cancel]);

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    const origin = start.current;
    if (origin && (event.pointerId !== origin.id || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > SLOP_PX)) cancel();
  }, [cancel]);

  const onContextMenu = useCallback((event: ReactMouseEvent) => {
    if (!enabled) return;
    cancel();
    if (Date.now() - firedAt.current < 1500) {
      event.preventDefault();
      return;
    }
    if (callback.current({ x: event.clientX, y: event.clientY }, event.target as Element) === false) return;
    event.preventDefault();
  }, [enabled, cancel]);

  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onContextMenu, onClickCapture };
}
