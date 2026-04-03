import { useRef, useCallback, useState } from 'react';

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
}

export function useDragTabIndicator<T extends string>({
  tabRect,
  tabLayerRef,
  tabButtonPositions,
  tabValues,
  activeTab,
  onTabChange,
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
    setIsDragging(true);
  }, [tabRect.x, tabRect.width, tabRect.y]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const newX = drag.startRectX + dx;

    // Direct DOM update — NO React re-render for indicator position
    if (indicatorRef.current) {
      indicatorRef.current.style.transform = `translate(${newX}px, ${drag.rectY}px)`;
      indicatorRef.current.style.transition = 'none';
    }

    // React state update only on tab boundary crossing (content switch)
    const centerX = drag.startRectX + dx + drag.startWidth / 2;
    const nearest = findNearest(centerX);
    if (nearest !== activeTabRef.current) {
      onTabChange(nearest);
    }
  }, [findNearest, onTabChange]);

  const handleDragEnd = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    setIsDragging(false);
    // GlassIndicator React render takes over with spring transition
    // indicatorRef.current.style.transform will be overridden by React's next render
  }, []);

  return { isDragging, indicatorRef, handleDragStart, handleDragMove, handleDragEnd };
}
