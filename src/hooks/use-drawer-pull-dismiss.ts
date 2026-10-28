import { useCallback, useRef } from 'react';

/**
 * Drag a vaul sheet shut from anywhere on it: handle, title or list.
 *
 * A scrollable sheet's list has `touch-action: pan-y`, so the browser owns
 * every touch there and vaul never sees the drag. This hook takes the pull
 * back when every scroller under the finger is already at the top and the
 * finger moves down first: the sheet follows the finger, and on release it
 * closes past a threshold (or a quick flick) and springs back otherwise. A
 * touch that starts with the list scrolled, or moves up first, stays an
 * ordinary scroll.
 *
 * Attach the returned callback ref to one wrapper around the sheet's handle,
 * header and list, marked `data-vaul-no-drag` so vaul does not drag it too.
 */
export function useDrawerPullDismiss<T extends HTMLElement>(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const detach = useRef<(() => void) | null>(null);

  return useCallback((root: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!root) return;
    let start: { x: number; y: number; t: number } | null = null;
    let claimed = false;
    let decided = false;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let sheet: HTMLElement | null = null;

    const reset = () => {
      start = null;
      claimed = false;
      decided = false;
    };

    const scrolled = (target: EventTarget | null) => {
      for (let node = target as HTMLElement | null; node && node !== root.parentElement; node = node.parentElement) {
        if (node.scrollTop > 0) return true;
      }
      return false;
    };
    let origin: EventTarget | null = null;

    const onStart = (e: TouchEvent) => {
      reset();
      if (e.touches.length !== 1 || scrolled(e.target)) return;
      origin = e.target;
      const touch = e.touches[0];
      start = { x: touch.clientX, y: touch.clientY, t: e.timeStamp };
      lastY = touch.clientY;
      lastT = e.timeStamp;
      velocity = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        claimed = dy > 0 && dy > Math.abs(dx) * 1.2 && !scrolled(origin);
        if (!claimed) {
          start = null;
          return;
        }
        sheet = root.closest<HTMLElement>('[data-vaul-drawer]');
        if (sheet) sheet.style.transition = 'none';
      }
      if (!claimed) return;
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (touch.clientY - lastY) / dt;
      lastY = touch.clientY;
      lastT = e.timeStamp;
      if (sheet) sheet.style.transform = `translate3d(0, ${Math.max(0, dy)}px, 0)`;
    };

    const onEnd = () => {
      if (!start || !claimed) {
        reset();
        return;
      }
      const dy = lastY - start.y;
      const target = sheet;
      reset();
      // A drag is never a tap on the row it started on.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      root.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 350);
      if (dy > 90 || (dy > 24 && velocity > 0.5)) {
        // vaul's slide-out keyframe has no `from`, so it carries on from here.
        if (target) target.style.transition = '';
        closeRef.current();
        return;
      }
      if (target) {
        target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
        target.style.transform = 'translate3d(0, 0, 0)';
        const clear = () => {
          if (claimed) return;
          target.style.transition = '';
          target.style.transform = '';
        };
        target.addEventListener('transitionend', clear, { once: true });
        setTimeout(clear, 600);
      }
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    detach.current = () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}
