/**
 * Global Feed Navigation Bar
 * ==========================
 * Renders the feed tab bar (Home, Videos, Images, etc.) at the top of every page
 * when in collapsed/fullscreen desktop mode. On the home page it controls the
 * active feed tab; on other pages clicking a tab navigates to /app with that tab.
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';

const HOME_STATE_STORAGE_KEY = 'home-feed-state';

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

  // Sync when navigating to/from home page
  useEffect(() => {
    setActiveTab(isHomePage ? getPersistedTab() : '');
  }, [isHomePage]);

  const { layerRef, setRef, rect } = useTabIndicator(activeTab, true);

  const handleTabClick = useCallback((tabValue: string) => {
    if (isHomePage) {
      // On home page, persist and let HomePage pick up the change via storage event
      sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: tabValue }));
      window.dispatchEvent(new StorageEvent('storage', {
        key: HOME_STATE_STORAGE_KEY,
        newValue: JSON.stringify({ tab: tabValue }),
      }));
    } else {
      // Navigate to home with the desired tab
      sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: tabValue }));
      navigate('/app');
    }
  }, [isHomePage, navigate]);

  return (
    <div className="sticky top-0 bg-black z-50 px-2 sm:px-3 pt-2 pb-2">
      <div className="bg-zinc-900 rounded-xl" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
        <div ref={layerRef} className="relative overflow-visible">
          <GlassIndicator rect={rect} borderRadius="0.75rem" layoutKey={`global-${activeTab}`} />
          <div className="relative z-20 flex scrollbar-hide">
            {FEED_TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  ref={setRef(tab.value)}
                  onClick={() => handleTabClick(tab.value)}
                  className={cn(
                    'relative z-40 flex-1 flex items-center justify-center px-3 sm:px-4 py-2.5 rounded-xl',
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
