/**
 * Shorts Enabled Context
 * ======================
 * Global setting to enable/disable Shorts across the app.
 * When disabled: the Shorts feed tab is hidden and Shorts carousels are
 * removed from the Home feed. Persists to localStorage.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'shorts-enabled';

interface ShortsEnabledContextType {
  shortsEnabled: boolean;
  setShortsEnabled: (value: boolean) => void;
}

const ShortsEnabledContext = createContext<ShortsEnabledContextType>({
  shortsEnabled: true,
  setShortsEnabled: () => {},
});

export function ShortsEnabledProvider({ children }: { children: ReactNode }) {
  const [shortsEnabled, setShortsState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const setShortsEnabled = useCallback((value: boolean) => {
    setShortsState(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setShortsState(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <ShortsEnabledContext.Provider value={{ shortsEnabled, setShortsEnabled }}>
      {children}
    </ShortsEnabledContext.Provider>
  );
}

export const useShortsEnabled = () => useContext(ShortsEnabledContext);
