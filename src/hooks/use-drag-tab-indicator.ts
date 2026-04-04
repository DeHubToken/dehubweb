import { useRef, useCallback, useState, startTransition } from 'react';
import type React from 'react';

/** Tab rect cached at drag-start — avoids getBoundingClientRect on every pointermove */
interface CachedTabRect<T> {
  key: T;
  relLeft: number;   // left edge relative to the layer element
  width: number;
  center: number;    // center relative to the layer element
}

interface DragState<T> {
  startX: number;
  startRectX: number;
  startWidth: number;
  rectY: number;
  /** Rects of all tab buttons, captured once at drag start */
  tabRects: CachedTabRect<T>[];
  /** Tabs sorted left→right by center position */
  sortedTabRects: CachedTabRect<T>[];
  /** Leftmost and rightmost valid indicator positions (for rubber-band) */
  minIndicatorX: number;
  maxIndicatorX: number;
  /** Velocity tracking for flick-to-snap */
  lastX: number;
  lastTime: number;
  velocityX: number; // px/ms — positive = moving right
}

interface UseDragTabIndicatorOptions<T extends string> {
  tabRect: { x: number; y: number; width: number; height: number; ready: boolean };
  tabLayerRef: React.RefObject<HTMLElement | null>;
  tabButtonPositions: React.MutableRefObject<Partial<Record<T, HTMLElement | null>>>;
  tabValues: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** Shared ref passed to useTabIndicator so it skips trackForDuration during drag */
  isDraggingRef: React.MutableRefObject<boolean>;
}

/** Rubber-band resistance: apply 35% of overshoot past the edge */
function applyRubberBand(x: number, min: number, max: number): number {
  if (x < min) return min - (min - x) * 0.35;
  if (x > max) return max + (x - max) * 0.35;
  return x;
}

/** Linear interpolation */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function useDragTabIndicator<T extends string>({
  tabRect,
  tabLayerRef,
  tabButtonPositions,
  tabValues,
  activeTab,
  onTabChange,
  isDraggingRef,
}: UseDragTabIndicatorOptions<T>) {
  const dragStateRef = useRef<DragState<T> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<T>(activeTab);
  activeTabRef.current = activeTab;

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const layer = tabLayerRef.current;
    if (!layer || !tabRect.ready) return;

    // Cache all tab rects ONCE — no DOM reads during pointermove
    const layerRect = layer.getBoundingClientRect();
    const tabRects: CachedTabRect<T>[] = [];
    for (const key of tabValues) {
      const el = tabButtonPositions.current[key];
      if (!el) continue;
      const br = el.getBoundingClientRect();
      const relLeft = br.left - layerRect.left;
      tabRects.push({ key, relLeft, width: br.width, center: relLeft + br.width / 2 });
    }
    const sortedTabRects = [...tabRects].sort((a, b) => a.center - b.center);

    // Rubber-band bounds: indicator x at leftmost and rightmost tab
    const minIndicatorX = sortedTabRects[0]?.relLeft ?? tabRect.x;
    const maxIndicatorX = sortedTabRects.length > 0
      ? sortedTabRects[sortedTabRects.length - 1].relLeft
      : tabRect.x;

    dragStateRef.current = {
      startX: e.clientX,
      startRectX: tabRect.x,
      startWidth: tabRect.width,
      rectY: tabRect.y,
      tabRects,
      sortedTabRects,
      minIndicatorX,
      maxIndicatorX,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocityX: 0,
    };

    isDraggingRef.current = true;
    setIsDragging(true);

    // Promote to compositor layer for the duration of the drag
    if (indicatorRef.current) {
      indicatorRef.current.style.willChange = 'transform, width';
    }
  }, [tabRect, tabLayerRef, tabButtonPositions, tabValues, isDraggingRef]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    const now = performance.now();
    const dt = now - drag.lastTime;
    if (dt > 0) {
      // Exponential moving average for smooth velocity
      const instantVelocity = (e.clientX - drag.lastX) / dt;
      drag.velocityX = drag.velocityX * 0.6 + instantVelocity * 0.4;
    }
    drag.lastX = e.clientX;
    drag.lastTime = now;

    const dx = e.clientX - drag.startX;
    const rawX = drag.startRectX + dx;

    // Rubber-band resistance at first and last tab
    const newX = applyRubberBand(rawX, drag.minIndicatorX, drag.maxIndicatorX);

    // Width morphing: interpolate indicator width between the two nearest tabs
    const indicatorCenter = newX + drag.startWidth / 2;
    let morphedWidth = drag.startWidth;
    const sorted = drag.sortedTabRects;
    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i];
      const right = sorted[i + 1];
      if (indicatorCenter >= left.center && indicatorCenter <= right.center) {
        const span = right.center - left.center;
        const t = span > 0 ? (indicatorCenter - left.center) / span : 0;
        morphedWidth = lerp(left.width, right.width, t);
        break;
      }
    }
    // Clamp to outermost tabs
    if (indicatorCenter < sorted[0]?.center) morphedWidth = sorted[0]?.width ?? drag.startWidth;
    if (indicatorCenter > sorted[sorted.length - 1]?.center) morphedWidth = sorted[sorted.length - 1]?.width ?? drag.startWidth;

    // Direct DOM update — zero React re-renders, zero layout reads
    if (indicatorRef.current) {
      indicatorRef.current.style.transform = `translate(${newX}px, ${drag.rectY}px)`;
      indicatorRef.current.style.width = `${morphedWidth}px`;
      indicatorRef.current.style.transition = 'none';
    }

    // Find nearest tab using cached rects (no getBoundingClientRect)
    let nearest = activeTabRef.current;
    let minDist = Infinity;
    for (const rect of drag.tabRects) {
      const dist = Math.abs(indicatorCenter - rect.center);
      if (dist < minDist) { minDist = dist; nearest = rect.key; }
    }

    if (nearest !== activeTabRef.current) {
      // Haptic pulse on boundary crossing
      if ('vibrate' in navigator) navigator.vibrate(6);

      // Content switch is low-priority — yield to pointer events
      startTransition(() => { onTabChange(nearest); });
    }
  }, [onTabChange]);

  const handleDragEnd = useCallback(() => {
    const drag = dragStateRef.current;
    if (!drag) return;
    dragStateRef.current = null;
    isDraggingRef.current = false;

    // Velocity-based flick snapping — snap to next/prev tab even if center
    // hasn't crossed, as long as flick was fast enough
    const FLICK_THRESHOLD = 0.35; // px/ms
    if (Math.abs(drag.velocityX) > FLICK_THRESHOLD) {
      const sorted = drag.sortedTabRects;
      const currentIdx = sorted.findIndex(r => r.key === activeTabRef.current);
      // positive velocity = moving right = next tab to the right
      const targetIdx = drag.velocityX > 0
        ? Math.min(sorted.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
      const target = sorted[targetIdx];
      if (target && target.key !== activeTabRef.current) {
        startTransition(() => { onTabChange(target.key); });
      }
    }

    setIsDragging(false);
    // Do NOT clear style.width or style.willChange here.
    // React's next render (triggered by setIsDragging above) will set all styles
    // correctly via GlassIndicator's style prop. Clearing width imperatively
    // causes a blank frame before React renders (glass disappears briefly).
    // The spring transition will animate from current imperative values to the
    // new tabRect values naturally.
  }, [isDraggingRef, onTabChange]);

  return { isDragging, indicatorRef, handleDragStart, handleDragMove, handleDragEnd };
}
