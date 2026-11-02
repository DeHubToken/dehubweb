/**
 * Hold-and-drag reordering for nav lists and grids.
 *
 * Touch: hold an item still for a moment and it lifts; drag it to its new
 * spot and let go. Moving before the hold completes is a scroll, as before.
 * Mouse: press and drag (a few px of movement starts it). A plain tap or click
 * still navigates; the click that ends a drag is swallowed.
 *
 * Motion follows .agents/skills/dehub-ui-craft (Motion): a touch shows the
 * press while it holds, the lift grows out of that press (no jump), the item
 * then follows the finger 1:1 from where it was taken hold of, neighbours
 * glide one slot over, and the drop decelerates into the slot with nothing
 * moving after it lands. Reduced motion keeps the reorder and drops the
 * scale and glides.
 *
 * The lifted item follows the pointer with the CSS `translate` property
 * written straight to the element (no re-render per move); `scale` is a
 * separate property so the lift can ease while the position never does. The list itself re-renders only when the
 * item crosses into another slot, and the items that move animate there.
 * The nearest scrolling ancestor scrolls when the pointer nears its edge.
 *
 * @module hooks/use-drag-reorder
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';

interface Options {
  /** Current on-screen order. */
  ids: string[];
  /** Called once on drop, only when the order changed. */
  onCommit: (ids: string[]) => void;
  /** Turn dragging off (e.g. while a search filter is typed). */
  disabled?: boolean;
  /** How long a touch must hold still before it lifts. */
  holdMs?: number;
  /** Scale while lifted: icons 1.06 to 1.08, wide rows about 1.02. */
  liftScale?: number;
  /** A single row (the bottom bar): the item slides along it, never off it. */
  axis?: 'x';
}

interface DragState {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Untransformed rect of the dragged item when it lifted. */
  originLeft: number;
  originTop: number;
  started: boolean;
  holdTimer: number | null;
  pressTimer: number | null;
  scroller: HTMLElement | null;
  raf: number | null;
}

const TOUCH_SLOP = 8;
const MOUSE_SLOP = 5;
const EDGE = 48;
/** Arrival curve from the UI craft rules: fast out, soft landing, no bounce. */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const PRESS_SCALE = 0.96;
/** A touch that is still down this long is a press, not the start of a scroll. */
const PRESS_DELAY = 90;
const LIFT_MS = 250;
const SLIDE_MS = 320;
const DROP_MS = 280;
const STAGGER_MS = 40;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** A rect with the element's own `scale` taken out (scale is about its centre). */
function unscaledRect(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const dw = (r.width - el.offsetWidth) / 2;
  const dh = (r.height - el.offsetHeight) / 2;
  return { left: r.left + dw, top: r.top + dh, right: r.right - dw, bottom: r.bottom - dh };
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const y = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const x = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (x || y) return node;
    node = node.parentElement;
  }
  return null;
}

export function useDragReorder({ ids, onCommit, disabled = false, holdMs = 380, liftScale = 1.06, axis }: Options) {
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** True while a drop or reset glide is still running. */
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | null>(null);
  const settleFor = useCallback((ms: number) => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    if (ms <= 0) { setSettling(false); return; }
    setSettling(true);
    settleTimer.current = window.setTimeout(() => { settleTimer.current = null; setSettling(false); }, ms);
  }, []);
  const order = liveOrder ?? ids;

  const els = useRef(new Map<string, HTMLElement>());
  const drag = useRef<DragState | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const swallowClick = useRef(false);
  // Rects of every item just before a reorder render, for the slide animation;
  // `stagger` is set for a reset, which glides everything in reading order.
  const before = useRef<Map<string, DOMRect> | null>(null);
  const stagger = useRef(false);
  // Where each item sits in the layout, measured with no slide running and
  // stamped with the scroller's offset, so hit testing never chases an item
  // that is still sliding (which flipped the order back and forth).
  const layout = useRef(new Map<string, { left: number; top: number; right: number; bottom: number; sl: number; st: number }>());

  const measure = useCallback(() => {
    const d = drag.current;
    const sl = d?.scroller?.scrollLeft ?? 0;
    const st = d?.scroller?.scrollTop ?? 0;
    layout.current.clear();
    els.current.forEach((el, id) => {
      // The lifted item's own slot counts too: a pointer still inside it
      // means "stay", not "nearest neighbour".
      const lifted = d && id === d.id ? el.style.translate : null;
      if (lifted) el.style.translate = '';
      const r = unscaledRect(el);
      if (lifted) el.style.translate = lifted;
      // Take out any slide still in flight: its translate is in the rect.
      let tx = 0;
      let ty = 0;
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none' && typeof DOMMatrixReadOnly !== 'undefined') {
        const m = new DOMMatrixReadOnly(t);
        tx = m.m41;
        ty = m.m42;
      }
      layout.current.set(id, { left: r.left - tx, top: r.top - ty, right: r.right - tx, bottom: r.bottom - ty, sl, st });
    });
  }, []);

  const refFns = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const refFor = useCallback((id: string) => {
    let fn = refFns.current.get(id);
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) els.current.set(id, el);
        else els.current.delete(id);
      };
      refFns.current.set(id, fn);
    }
    return fn;
  }, []);

  /** Keep the lifted item under the pointer, wherever its slot now is. */
  const place = useCallback(() => {
    const d = drag.current;
    if (!d || !d.started) return;
    const el = els.current.get(d.id);
    if (!el) return;
    el.style.translate = '';
    const rect = unscaledRect(el);
    // Measured from the press point, so the grab offset never changes.
    const dx = d.x - d.startX - (rect.left - d.originLeft);
    const dy = axis === 'x' ? 0 : d.y - d.startY - (rect.top - d.originTop);
    el.style.translate = `${dx}px ${dy}px`;
  }, [axis]);

  /** Which slot is under the pointer, by the other items' resting rects. */
  const hitTest = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const current = orderRef.current;
    const sl = d.scroller?.scrollLeft ?? 0;
    const st = d.scroller?.scrollTop ?? 0;
    let target = -1;
    let best = Infinity;
    // On a single row only the finger's x counts: drifting up off the bar
    // still moves the item along it.
    const own = layout.current.get(d.id);
    const py = axis === 'x' && own ? (own.top + own.bottom) / 2 - (st - own.st) : d.y;
    for (let index = 0; index < current.length; index += 1) {
      const id = current[index];
      const m = layout.current.get(id);
      if (!m) continue;
      const left = m.left - (sl - m.sl);
      const right = m.right - (sl - m.sl);
      const top = m.top - (st - m.st);
      const bottom = m.bottom - (st - m.st);
      if (d.x >= left && d.x <= right && py >= top && py <= bottom) {
        target = index;
        break;
      }
      if (id === d.id) continue;
      const w = right - left;
      const h = bottom - top;
      const dist = Math.hypot(d.x - (left + w / 2), py - (top + h / 2));
      if (dist < Math.min(w, h) * 0.75 && dist < best) {
        best = dist;
        target = index;
      }
    }
    const from = current.indexOf(d.id);
    if (target < 0 || target === from) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(target, 0, d.id);
    const snap = new Map<string, DOMRect>();
    els.current.forEach((el, id) => { if (id !== d.id) snap.set(id, el.getBoundingClientRect()); });
    before.current = snap;
    orderRef.current = next;
    setLiveOrder(next);
  }, [axis]);

  // Slide the items that changed slot from where they were.
  useLayoutEffect(() => {
    const snap = before.current;
    if (!snap) return;
    before.current = null;
    const staggered = stagger.current;
    stagger.current = false;
    if (drag.current) measure();
    if (!reducedMotion()) {
      const ordered = staggered ? orderRef.current : [...snap.keys()];
      let step = 0;
      ordered.forEach((id) => {
        const was = snap.get(id);
        const el = els.current.get(id);
        if (!was || !el || typeof el.animate !== 'function') return;
        const now = el.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (!dx && !dy) return;
        // A jump across a pinned item (Create) or a row wrap would slide
        // straight through its neighbours: tuck it small on the way instead.
        const far = Math.hypot(dx, dy) > Math.max(now.width, now.height) * 1.5;
        const frames: Keyframe[] = far
          ? [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(0.7)`, opacity: 0.55, offset: 0.5 },
            { transform: 'translate(0, 0)' },
          ]
          : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }];
        const delay = staggered ? Math.min(step, 10) * STAGGER_MS : 0;
        step += 1;
        el.animate(frames, { duration: SLIDE_MS, delay, easing: EASE, fill: 'backwards' });
      });
      if (staggered) settleFor(SLIDE_MS + Math.min(step, 10) * STAGGER_MS + 40);
    }
    place();
  }, [liveOrder, ids, measure, place, settleFor]);

  /**
   * Call just before changing `ids` from outside a drag (Reset): everything
   * glides from where it was to its new slot, staggered in reading order.
   */
  const animateNextChange = useCallback(() => {
    if (drag.current) return;
    const snap = new Map<string, DOMRect>();
    els.current.forEach((el, id) => snap.set(id, el.getBoundingClientRect()));
    before.current = snap;
    stagger.current = true;
  }, []);

  const tick = useCallback(() => {
    const d = drag.current;
    if (!d || !d.started) return;
    const s = d.scroller;
    if (s) {
      const r = s.getBoundingClientRect();
      const horizontal = s.scrollWidth > s.clientWidth && !(s.scrollHeight > s.clientHeight);
      let delta = 0;
      if (horizontal) {
        if (d.x < r.left + EDGE) delta = -Math.ceil((r.left + EDGE - d.x) / 6);
        else if (d.x > r.right - EDGE) delta = Math.ceil((d.x - (r.right - EDGE)) / 6);
        if (delta) s.scrollLeft += delta;
      } else {
        if (d.y < r.top + EDGE) delta = -Math.ceil((r.top + EDGE - d.y) / 5);
        else if (d.y > r.bottom - EDGE) delta = Math.ceil((d.y - (r.bottom - EDGE)) / 5);
        if (delta) s.scrollTop += delta;
      }
      if (delta) {
        place();
        hitTest();
      }
    }
    d.raf = requestAnimationFrame(tick);
  }, [hitTest, place]);

  const begin = useCallback(() => {
    const d = drag.current;
    if (!d || d.started) return;
    const el = els.current.get(d.id);
    if (!el) return;
    d.started = true;
    d.holdTimer = null;
    if (d.pressTimer) window.clearTimeout(d.pressTimer);
    d.pressTimer = null;
    el.style.translate = '';
    const rect = unscaledRect(el);
    d.originLeft = rect.left;
    d.originTop = rect.top;
    // Measured from where the pointer is now, so the item doesn't jump.
    d.startX = d.x;
    d.startY = d.y;
    d.scroller = scrollParent(el);
    measure();
    const reduce = reducedMotion();
    // Only scale, fill and shadow ease; the position never does.
    el.style.transition = reduce
      ? 'none'
      : `scale ${LIFT_MS}ms ${EASE}, box-shadow ${LIFT_MS}ms ${EASE}, background-color ${LIFT_MS}ms ${EASE}`;
    // Every surface lays its items out with flex or grid, where z-index works
    // without a position (a position would also move offsetParent, which the
    // desktop rail's active glass measures against).
    el.style.zIndex = '60';
    el.style.translate = '0px 0px';
    el.style.scale = reduce ? '' : String(liftScale);
    document.documentElement.style.userSelect = 'none';
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    setDraggingId(d.id);
    setLiveOrder(idsRef.current);
    d.raf = requestAnimationFrame(tick);
  }, [measure, tick, liftScale]);

  const finish = useCallback((commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.holdTimer) window.clearTimeout(d.holdTimer);
    if (d.pressTimer) window.clearTimeout(d.pressTimer);
    if (d.raf) cancelAnimationFrame(d.raf);
    const el = els.current.get(d.id);
    const reduce = reducedMotion();
    if (!d.started) {
      // A press that turned into a scroll or a tap: let go of the press.
      if (el && el.style.scale) {
        el.style.transition = reduce ? 'none' : `scale 150ms ${EASE}`;
        el.style.scale = '';
        window.setTimeout(() => { if (drag.current?.id !== d.id) el.style.transition = ''; }, 160);
      }
      return;
    }
    if (el) {
      const from = el.style.translate;
      el.style.translate = '';
      // Scale and shadow ease back on the lift's transition; the slot glide
      // runs alongside on the same curve, so both land together.
      el.style.scale = '';
      if (!reduce && from && from !== '0px 0px' && typeof el.animate === 'function') {
        el.animate([{ translate: from }, { translate: '0px 0px' }], { duration: DROP_MS, easing: EASE });
      }
      const id = d.id;
      window.setTimeout(() => {
        if (drag.current?.id === id) return;
        el.style.zIndex = '';
        el.style.transition = '';
      }, reduce ? 0 : DROP_MS + 20);
      // Neighbours from the last slot change may still be gliding too.
      settleFor(reduce ? 0 : Math.max(DROP_MS, SLIDE_MS) + 40);
    }
    document.documentElement.style.userSelect = '';
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 80);
    const final = orderRef.current;
    const changed = final.length !== idsRef.current.length || final.some((id, i) => id !== idsRef.current[i]);
    setDraggingId(null);
    setLiveOrder(null);
    if (commit && changed) commitRef.current(final);
  }, [settleFor]);

  // Document-level listeners while a press is live.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const moved = Math.hypot(d.x - d.startX, d.y - d.startY);
      if (!d.started) {
        if (d.pointerType === 'mouse') {
          if (moved > MOUSE_SLOP) begin();
        } else if (moved > TOUCH_SLOP) {
          // Moved before the hold finished: that's a scroll, not a drag.
          finish(false);
        }
        return;
      }
      place();
      hitTest();
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      finish(true);
    };
    const onCancel = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      finish(d.started);
    };
    // Once lifted, the page must not scroll under the finger. Non-passive so
    // preventDefault holds; touchmove is what decides a pan on mobile.
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current?.started && e.cancelable) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current?.started) {
        orderRef.current = idsRef.current;
        finish(false);
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('keydown', onKey);
    };
  }, [begin, finish, hitTest, place]);

  useEffect(() => () => finish(false), [finish]);

  const onPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (disabled || drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const d: DragState = {
      id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      originLeft: 0,
      originTop: 0,
      started: false,
      holdTimer: null,
      pressTimer: null,
      scroller: null,
      raf: null,
    };
    drag.current = d;
    if (e.pointerType !== 'mouse') {
      d.holdTimer = window.setTimeout(begin, holdMs);
      // Show the press while it holds; the lift then grows out of it.
      if (!reducedMotion()) {
        d.pressTimer = window.setTimeout(() => {
          d.pressTimer = null;
          const el = els.current.get(id);
          if (!el || drag.current !== d || d.started) return;
          el.style.transition = `scale ${holdMs - PRESS_DELAY}ms ease-out`;
          el.style.scale = String(PRESS_SCALE);
        }, PRESS_DELAY);
      }
    }
  }, [disabled, begin, holdMs]);

  /** Spread onto each reorderable item. */
  const itemProps = useCallback((id: string) => ({
    ref: refFor(id),
    'data-reorder-item': id,
    'data-reorder-dragging': draggingId === id ? 'true' : undefined,
    'data-no-swipe': true,
    draggable: false,
    onPointerDown: (e: React.PointerEvent) => onPointerDown(id, e),
    onClickCapture: (e: React.MouseEvent) => {
      if (swallowClick.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    // Android's long-press menu and iOS's link preview would pop over the lift.
    onContextMenu: (e: React.MouseEvent) => {
      if (drag.current && drag.current.pointerType !== 'mouse') e.preventDefault();
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
  }), [draggingId, onPointerDown, refFor]);

  return { order, draggingId, settling, animateNextChange, itemProps };
}
