/**
 * Global Feed Navigation Bar
 * ==========================
 * Renders the feed tab bar (Home, Videos, Images, etc.) at the top of every page
 * when in collapsed/fullscreen desktop mode. On the home page it controls the
 * active feed tab; on other pages clicking a tab navigates to /app with that tab.
 *
 * Supports drag-to-swipe: users can grab the active indicator and drag it
 * between tabs for a tactile, interactive experience.
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';

const HOME_STATE_STORAGE_KEY = 'home-feed-state';
const HOME_TAB_SWITCH_EVENT = 'switch-home-tab';

/** Read the currently persisted home tab from sessionStorage */
function getPersistedTab(): string {
  try {
    const saved = sessionStorage.getItem(HOME_STATE_STORAGE_KEY);
    if (saved) {
      const { tab } = JSON.parse(saved);
      if (tab) return tab;
    }
  } catch { /* ignore */ }
  return 'home';
}

export function GlobalFeedNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/app';

  const [activeTab, setActiveTab] = useState(() => isHomePage ? getPersistedTab() : '');
  const [enableTransition, setEnableTransition] = useState(false);

  // Keep a ref in sync so drag handlers avoid stale activeTab closures.
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Reset transition on page change
  useEffect(() => {
    setEnableTransition(false);
  }, [isHomePage]);

  // Listen for tab changes from HomePage swipes via custom event
  useEffect(() => {
    const handler = () => {
      if (isHomePage) {
        setActiveTab(getPersistedTab());
      }
    };
    window.addEventListener('home-tab-changed', handler);
    // Also sync on storage events (cross-tab)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === HOME_STATE_STORAGE_KEY && isHomePage) {
        setActiveTab(getPersistedTab());
      }
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('home-tab-changed', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, [isHomePage]);

  // Sync when navigating back to home page — always keep last known tab
  useEffect(() => {
    if (isHomePage) {
      setActiveTab(getPersistedTab());
    }
  }, [isHomePage]);

  const { layerRef, setRef, rect } = useTabIndicator(activeTab, true);

  // ── Drag-to-swipe state ──────────────────────────────────────────────
  const tabButtonPositions = useRef<Partial<Record<string, HTMLElement | null>>>({});
  const dragState = useRef<{ startX: number; startRectX: number; startWidth: number; hasMoved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  const findNearestTab = useCallback((indicatorCenterX: number) => {
    const layer = layerRef.current;
    if (!layer) return activeTabRef.current;
    const layerRect = layer.getBoundingClientRect();
    let nearest = activeTabRef.current;
    let minDist = Infinity;
    for (const tab of FEED_TABS) {
      const el = tabButtonPositions.current[tab.value];
      if (!el) continue;
      const br = el.getBoundingClientRect();
      const btnCenter = br.left - layerRect.left + br.width / 2;
      const dist = Math.abs(indicatorCenterX - btnCenter);
      if (dist < minDist) { minDist = dist; nearest = tab.value; }
    }
    return nearest;
  }, [layerRef]);

  const applyTab = useCallback((tabValue: string) => {
    if (isHomePage) {
      sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: tabValue }));
      // Directly sync HomePage while dragging — avoids relying on synthetic storage events.
      window.dispatchEvent(new CustomEvent(HOME_TAB_SWITCH_EVENT, { detail: tabValue }));
      window.dispatchEvent(new CustomEvent('home-tab-changed'));
    }
    activeTabRef.current = tabValue;
    setActiveTab(tabValue);
  }, [isHomePage]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    // Allow all touch drags, but only primary mouse button for mouse.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startRectX: rect.x, startWidth: rect.width, hasMoved: false };
    setIsDragging(true);
    setDragOffsetX(0);
  }, [rect.x, rect.width]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    if (Math.abs(dx) > 3) dragState.current.hasMoved = true;
    setDragOffsetX(dx);
    const currentCenterX = dragState.current.startRectX + dx + dragState.current.startWidth / 2;
    const nearest = findNearestTab(currentCenterX);
    if (nearest !== activeTabRef.current) {
      applyTab(nearest);
    }
  }, [findNearestTab, applyTab]);

  const handleDragEnd = useCallback(() => {
    if (!dragState.current) return;

    const wasDrag = dragState.current.hasMoved;
    dragState.current = null;
    setIsDragging(false);
    setDragOffsetX(0);

    if (wasDrag) {
      suppressClickRef.current = true;
      setEnableTransition(true);
      setTimeout(() => setEnableTransition(false), 450);
    }
  }, []);

  const dragDisplayRect = isDragging
    ? { ...rect, x: (dragState.current?.startRectX ?? rect.x) + dragOffsetX, ready: true }
    : rect;

  const handleTabClick = useCallback((tabValue: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (isDragging) return;

    if (isHomePage) {
      if (tabValue === activeTab) {
        // Same tab clicked — dispatch event so HomePage toggles filters
        window.dispatchEvent(new CustomEvent('home-tab-reclick', { detail: tabValue }));
      } else {
        // Different tab — enable smooth transition, auto-reset after animation
        setEnableTransition(true);
        setTimeout(() => setEnableTransition(false), 450);
        applyTab(tabValue);
      }
    } else {
      // Navigate to home with the desired tab
      sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: tabValue }));
      navigate('/app');
    }
  }, [isHomePage, navigate, activeTab, isDragging, applyTab]);

  return (
    <div className="sticky top-0 bg-black z-50 p-2 sm:p-3 pb-2 sm:pb-2">
      <div className="bg-zinc-900 rounded-xl" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
        <div ref={layerRef} className="relative overflow-visible">
          <GlassIndicator rect={dragDisplayRect} borderRadius="0.75rem" layoutKey={`global-nav-${activeTab}`} enableTransition={!isDragging && enableTransition} fixedHeightPx={35} />
          {/* Drag handle overlay */}
          {dragDisplayRect.ready && (
            <div
              className="absolute z-30 cursor-grab active:cursor-grabbing"
              style={{
                transform: `translate(${dragDisplayRect.x}px, ${dragDisplayRect.y}px)`,
                width: dragDisplayRect.width,
                height: dragDisplayRect.height,
                touchAction: 'none',
                userSelect: 'none',
                transition: !isDragging && enableTransition
                  ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                  : 'none',
              }}
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            />
          )}
          <div className="relative z-20 flex scrollbar-hide" style={{ touchAction: 'pan-x' }}>
            {FEED_TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  data-feed-tab={tab.value}
                  ref={(el) => {
                    setRef(tab.value)(el);
                    tabButtonPositions.current[tab.value] = el;
                  }}
                  onClick={() => handleTabClick(tab.value)}
                  className={cn(
                    'relative z-10 flex-1 flex items-center justify-center px-3 sm:px-4 py-2.5 rounded-xl',
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <tab.icon className="relative z-10 w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
