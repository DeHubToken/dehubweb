/**
 * Hold-and-drag reordering for nav lists and grids.
 *
 * Touch: hold an item still for a moment and it lifts; drag it to its new
 * spot and let go. Moving before the hold completes is a scroll, as before.
 * Mouse: press and drag (a few px of movement starts it). A plain tap or click
 * still navigates; the click that ends a drag is swallowed.
 *
 * The lifted item follows the pointer with a transform written straight to the
 * element (no re-render per move). The list itself re-renders only when the
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
  scroller: HTMLElement | null;
  raf: number | null;
}

const TOUCH_SLOP = 8;
const MOUSE_SLOP = 5;
const EDGE = 48;

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

export function useDragReorder({ ids, onCommit, disabled = false, holdMs = 380 }: Options) {
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
  // Rects of every item just before a reorder render, for the slide animation.
  const before = useRef<Map<string, DOMRect> | null>(null);
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
      const lifted = d && id === d.id ? el.style.transform : null;
      if (lifted) el.style.transform = '';
      const r = el.getBoundingClientRect();
      if (lifted) el.style.transform = lifted;
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
    el.style.transform = '';
    const rect = el.getBoundingClientRect();
    const dx = d.x - d.startX - (rect.left - d.originLeft);
    const dy = d.y - d.startY - (rect.top - d.originTop);
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.06)`;
  }, []);

  /** Which slot is under the pointer, by the other items' resting rects. */
  const hitTest = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const current = orderRef.current;
    const sl = d.scroller?.scrollLeft ?? 0;
    const st = d.scroller?.scrollTop ?? 0;
    let target = -1;
    let best = Infinity;
    for (let index = 0; index < current.length; index += 1) {
      const id = current[index];
      const m = layout.current.get(id);
      if (!m) continue;
      const left = m.left - (sl - m.sl);
      const right = m.right - (sl - m.sl);
      const top = m.top - (st - m.st);
      const bottom = m.bottom - (st - m.st);
      if (d.x >= left && d.x <= right && d.y >= top && d.y <= bottom) {
        target = index;
        break;
      }
      if (id === d.id) continue;
      const w = right - left;
      const h = bottom - top;
      const dist = Math.hypot(d.x - (left + w / 2), d.y - (top + h / 2));
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
  }, []);

  // Slide the items that changed slot from where they were.
  useLayoutEffect(() => {
    const snap = before.current;
    if (!snap) return;
    before.current = null;
    measure();
    snap.forEach((was, id) => {
      const el = els.current.get(id);
      if (!el || typeof el.animate !== 'function') return;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (!dx && !dy) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    });
    place();
  }, [liveOrder, measure, place]);

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
    const rect = el.getBoundingClientRect();
    d.originLeft = rect.left;
    d.originTop = rect.top;
    // Measured from where the pointer is now, so the item doesn't jump.
    d.startX = d.x;
    d.startY = d.y;
    d.scroller = scrollParent(el);
    measure();
    el.style.transition = 'box-shadow 150ms ease';
    // Every surface lays its items out with flex or grid, where z-index works
    // without a position (a position would also move offsetParent, which the
    // desktop rail's active glass measures against).
    el.style.zIndex = '60';
    el.style.transform = 'translate3d(0,0,0) scale(1.06)';
    document.documentElement.style.userSelect = 'none';
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    setDraggingId(d.id);
    setLiveOrder(idsRef.current);
    d.raf = requestAnimationFrame(tick);
  }, [measure, tick]);

  const finish = useCallback((commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.holdTimer) window.clearTimeout(d.holdTimer);
    if (d.raf) cancelAnimationFrame(d.raf);
    if (!d.started) return;
    const el = els.current.get(d.id);
    if (el) {
      const from = el.style.transform;
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.transition = '';
      if (from && typeof el.animate === 'function') {
        el.animate([{ transform: from }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
      }
    }
    document.documentElement.style.userSelect = '';
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 80);
    const final = orderRef.current;
    const changed = final.length !== idsRef.current.length || final.some((id, i) => id !== idsRef.current[i]);
    setDraggingId(null);
    setLiveOrder(null);
    if (commit && changed) commitRef.current(final);
  }, []);

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
      scroller: null,
      raf: null,
    };
    drag.current = d;
    if (e.pointerType !== 'mouse') d.holdTimer = window.setTimeout(begin, holdMs);
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

  return { order, draggingId, itemProps };
}
