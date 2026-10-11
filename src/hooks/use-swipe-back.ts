import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnyOverlayOpen } from '@/lib/overlay-open';
import { findSwipeBackControl, completesSwipeBack } from '@/lib/swipe-back';

/** One listener for the shell; cached pages never install competing listeners. */
export function useSwipeBack() {
  const location = useLocation();
  const overlayOpen = useAnyOverlayOpen();
  useEffect(() => {
    let start: { id: number; x: number; y: number; at: number; control: HTMLElement | null } | null = null;
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rtl = document.documentElement.dir === 'rtl';
    const direction = rtl ? -1 : 1;
    const onStart = (event: TouchEvent) => {
      start = null;
      if (locked || event.touches.length !== 1 || !window.matchMedia('(pointer: coarse)').matches) return;
      const touch = event.touches[0];
      const edge = rtl ? window.innerWidth - touch.clientX : touch.clientX;
      if (edge < 0 || edge > 28) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"],[role="slider"],[data-swipe-back-ignore]')) return;
      const control = findSwipeBackControl(event.target instanceof Element ? event.target : null, overlayOpen);
      if (!control) return;
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: performance.now(), control };
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = Array.from(event.touches).find(touch => touch.identifier === start?.id);
      if (event.touches.length !== 1 || !touch) { start = null; return; }
      const dx = (touch.clientX - start.x) * direction;
      const dy = Math.abs(touch.clientY - start.y);
      if (dy > 14 && dy >= Math.abs(dx)) { start = null; return; }
      if (dx < -14) { start = null; return; }
      if (dx > 14 && dx > dy * 2 && event.cancelable) event.preventDefault();
    };
    const onEnd = (event: TouchEvent) => {
      const origin = start;
      start = null;
      if (!origin) return;
      const touch = Array.from(event.changedTouches).find(touch => touch.identifier === origin.id);
      if (!touch) return;
      const dx = (touch.clientX - origin.x) * direction;
      const elapsed = Math.max(1, performance.now() - origin.at);
      if (!completesSwipeBack(dx, touch.clientY - origin.y, dx / elapsed * 1000)) return;
      // A browser/native back or another control may already have changed the
      // page during this touch. Never apply the same gesture twice.
      if (window.location.pathname !== location.pathname || (origin.control && !origin.control.isConnected)) return;
      if (event.cancelable) event.preventDefault();
      locked = true;
      timer = setTimeout(() => { locked = false; }, 600);
      origin.control?.click();
    };
    const cancel = () => { start = null; };
    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, { passive: false, capture: true });
    document.addEventListener('touchcancel', cancel, true);
    window.addEventListener('popstate', cancel);
    return () => {
      document.removeEventListener('touchstart', onStart, true);
      document.removeEventListener('touchmove', onMove, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', cancel, true);
      window.removeEventListener('popstate', cancel);
      if (timer) clearTimeout(timer);
    };
  }, [location.pathname, location.key, overlayOpen]);
}
