import { useRef, useCallback, useState, startTransition } from 'react';
import type React from 'react';

interface DragState {
  startX: number;
  startRectX: number;
  startWidth: number;
  rectY: number;
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

export function useDragTabIndicator<T extends string>({
  tabRect,
  tabLayerRef,
  tabButtonPositions,
  tabValues,
  activeTab,
  onTabChange,
  isDraggingRef,
}: UseDragTabIndicatorOptions<T>) {
  const dragStateRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  // Keep activeTab in a ref so handleDragMove closure doesn't go stale
  const activeTabRef = useRef<T>(activeTab);
  activeTabRef.current = activeTab;

  const findNearest = useCallback((indicatorCenterX: number): T => {
    const layer = tabLayerRef.current;
    if (!layer) return activeTabRef.current;
    const layerRect = layer.getBoundingClientRect();
    let nearest = activeTabRef.current;
    let minDist = Infinity;
    for (const key of tabValues) {
      const el = tabButtonPositions.current[key];
      if (!el) continue;
      const br = el.getBoundingClientRect();
      const btnCenter = br.left - layerRect.left + br.width / 2;
      const dist = Math.abs(indicatorCenterX - btnCenter);
      if (dist < minDist) { minDist = dist; nearest = key; }
    }
    return nearest;
  }, [tabLayerRef, tabButtonPositions, tabValues]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startRectX: tabRect.x,
      startWidth: tabRect.width,
      rectY: tabRect.y,
    };
    isDraggingRef.current = true;
    setIsDragging(true);
    // Promote to compositor layer for the duration of the drag
    if (indicatorRef.current) {
      indicatorRef.current.style.willChange = 'transform';
    }
  }, [tabRect.x, tabRect.width, tabRect.y, isDraggingRef]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const newX = drag.startRectX + dx;

    // Direct DOM update — NO React re-render for indicator position.
    // This runs on every pointermove without touching React.
    if (indicatorRef.current) {
      indicatorRef.current.style.transform = `translate(${newX}px, ${drag.rectY}px)`;
      indicatorRef.current.style.transition = 'none';
    }

    // Content switch: wrap in startTransition so React yields to pointer events
    // during heavy re-renders (feeds, cards, etc.). isDraggingRef prevents
    // useTabIndicator's trackForDuration from fighting our imperative position.
    const centerX = drag.startRectX + dx + drag.startWidth / 2;
    const nearest = findNearest(centerX);
    if (nearest !== activeTabRef.current) {
      startTransition(() => {
        onTabChange(nearest);
      });
    }
  }, [findNearest, onTabChange]);

  const handleDragEnd = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
    // Clear compositor promotion — React's next render will set correct transform
    // with spring transition (enableTransition=true after isDragging=false)
    if (indicatorRef.current) {
      indicatorRef.current.style.willChange = '';
    }
  }, [isDraggingRef]);

  return { isDragging, indicatorRef, handleDragStart, handleDragMove, handleDragEnd };
}
