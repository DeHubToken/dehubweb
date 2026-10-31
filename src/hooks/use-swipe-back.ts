import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnyOverlayOpen } from '@/lib/overlay-open';
import { canGoBackInApp, findSwipeBackControl, completesSwipeBack, pageSwipeAllowed, SWIPE_BACK_EDGE, SWIPE_BACK_PAGE_DISTANCE } from '@/lib/swipe-back';

const ARROW = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';

/**
 * The round arrow that comes in from the edge while a back drag is held, so
 * the finger can see it is about to go back (and let go short to cancel).
 * A dark chip with a white arrow reads on every theme, like the arrow on media.
 */
function createCue(rtl: boolean) {
  let el: HTMLDivElement | null = null;
  const ensure = () => {
    if (el) return el;
    el = document.createElement('div');
    el.setAttribute('data-swipe-back-cue', '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = ARROW;
    Object.assign(el.style, {
      position: 'fixed', top: '0', [rtl ? 'right' : 'left']: '0', zIndex: '2147483000',
      width: '44px', height: '44px', borderRadius: '9999px', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: '#fff',
      background: 'rgba(0,0,0,0.55)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      pointerEvents: 'none', opacity: '0', willChange: 'transform, opacity',
    } as Partial<CSSStyleDeclaration>);
    if (rtl) (el.firstElementChild as SVGElement | null)?.style.setProperty('transform', 'scaleX(-1)');
    document.body.appendChild(el);
    return el;
  };
  return {
    show(progress: number, y: number) {
      const cue = ensure();
      const p = Math.min(1, Math.max(0, progress));
      const x = (-52 + 64 * p) * (rtl ? -1 : 1);
      const top = Math.min(window.innerHeight - 64, Math.max(20, y - 22));
      cue.style.transition = 'none';
      cue.style.opacity = String(Math.min(1, p * 1.6));
      cue.style.transform = `translate3d(${x}px, ${top}px, 0) scale(${p >= 1 ? 1.08 : 0.8 + 0.2 * p})`;
    },
    hide(committed: boolean) {
      if (!el) return;
      el.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
      el.style.opacity = '0';
      if (!committed) el.style.transform = el.style.transform.replace(/translate3d\([^,]+,/, `translate3d(${rtl ? 52 : -52}px,`);
    },
    remove() { el?.remove(); el = null; },
  };
}

/** One listener for the shell; cached pages never install competing listeners. */
export function useSwipeBack() {
  const location = useLocation();
  const overlayOpen = useAnyOverlayOpen();
  useEffect(() => {
    let start: { id: number; x: number; y: number; at: number; control: HTMLElement | null; edge: boolean } | null = null;
    let dragging = false;
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rtl = document.documentElement.dir === 'rtl';
    const direction = rtl ? -1 : 1;
    const cue = createCue(rtl);
    // A page that re-renders under the finger detaches the touched node, and
    // its later touch events then never bubble to the document. Listen on the
    // node itself too, handling each event once.
    let held: EventTarget | null = null;
    const seen = new WeakSet<Event>();
    const once = <E extends Event>(fn: (event: E) => void) => (event: E) => { if (seen.has(event)) return; seen.add(event); fn(event); };
    const release = () => {
      held?.removeEventListener('touchmove', move as EventListener);
      held?.removeEventListener('touchend', end as EventListener);
      held?.removeEventListener('touchcancel', cancel);
      held = null;
    };
    const reset = (committed = false) => {
      release();
      if (dragging) cue.hide(committed);
      start = null;
      dragging = false;
    };
    const onStart = (event: TouchEvent) => {
      reset();
      if (locked || event.touches.length !== 1 || !window.matchMedia('(pointer: coarse)').matches) return;
      const touch = event.touches[0];
      const fromEdge = rtl ? window.innerWidth - touch.clientX : touch.clientX;
      if (fromEdge < 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const edge = fromEdge <= SWIPE_BACK_EDGE;
      // The edge strip always goes back; further in, a plain stretch of page
      // does too, but never from on top of something that swipes sideways.
      if (edge ? target?.closest('input,textarea,[contenteditable="true"],[role="slider"],[data-swipe-back-ignore]') : !pageSwipeAllowed(target)) return;
      // The visible arrow when there is one (it may be a local step back);
      // otherwise plain history back, so every page that can go back does.
      const control = findSwipeBackControl(target, overlayOpen);
      if (!control && (overlayOpen || !canGoBackInApp(window.location.pathname))) return;
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: performance.now(), control, edge };
      held = event.target;
      held?.addEventListener('touchmove', move as EventListener, { passive: false });
      held?.addEventListener('touchend', end as EventListener, { passive: false });
      held?.addEventListener('touchcancel', cancel);
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = Array.from(event.touches).find(touch => touch.identifier === start?.id);
      if (event.touches.length !== 1 || !touch) { reset(); return; }
      const dx = (touch.clientX - start.x) * direction;
      const dy = Math.abs(touch.clientY - start.y);
      if (!dragging) {
        // Wait for a clearly sideways drag; a vertical one is a scroll.
        const claim = start.edge ? 14 : 18;
        if (dy > 12 && dy >= Math.abs(dx)) { reset(); return; }
        if (dx < -14) { reset(); return; }
        if (dx > claim && dx > dy * 2) dragging = true;
        // The browser commits a touch to scrolling on its first move. Keep a
        // sideways start ours, or the rest of the drag never reaches the page.
        else if (dx > 0 && dx > dy * 1.5 && event.cancelable) event.preventDefault();
      }
      if (!dragging) return;
      if (event.cancelable) event.preventDefault();
      cue.show(dx / (start.edge ? 64 : SWIPE_BACK_PAGE_DISTANCE), touch.clientY);
    };
    const onEnd = (event: TouchEvent) => {
      const origin = start;
      const wasDragging = dragging;
      if (!origin) return;
      const touch = Array.from(event.changedTouches).find(touch => touch.identifier === origin.id);
      if (!touch) { reset(); return; }
      const dx = (touch.clientX - origin.x) * direction;
      const elapsed = Math.max(1, performance.now() - origin.at);
      const minDistance = origin.edge ? 64 : SWIPE_BACK_PAGE_DISTANCE;
      const commits = (origin.edge || wasDragging) && completesSwipeBack(dx, touch.clientY - origin.y, dx / elapsed * 1000, minDistance);
      reset(commits);
      if (!commits) return;
      // A browser/native back may already have changed the page during this
      // touch (popstate also cancels). Never apply the same gesture twice.
      if (window.location.pathname !== location.pathname) return;
      // A re-render may have swapped the arrow for an identical new one.
      const control = origin.control?.isConnected ? origin.control : findSwipeBackControl(null, overlayOpen);
      if (!control && !(origin.control === null && canGoBackInApp(window.location.pathname))) return;
      if (event.cancelable) event.preventDefault();
      locked = true;
      timer = setTimeout(() => { locked = false; }, 600);
      if (control) control.click();
      else window.history.back();
    };
    const cancel = () => reset();
    const move = once(onMove);
    const end = once(onEnd);
    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchmove', move, { passive: false, capture: true });
    document.addEventListener('touchend', end, { passive: false, capture: true });
    document.addEventListener('touchcancel', cancel, true);
    window.addEventListener('popstate', cancel);
    return () => {
      document.removeEventListener('touchstart', onStart, true);
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true);
      document.removeEventListener('touchcancel', cancel, true);
      window.removeEventListener('popstate', cancel);
      if (timer) clearTimeout(timer);
      release();
      cue.remove();
    };
  }, [location.pathname, location.key, overlayOpen]);
}
