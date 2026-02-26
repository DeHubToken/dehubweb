/**
 * Autoplay Context
 * ================
 * Global setting for video autoplay on scroll. Off by default.
 * Persists to localStorage.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'autoplay-videos';

interface AutoplayContextType {
  autoplayEnabled: boolean;
  setAutoplayEnabled: (value: boolean) => void;
}

const AutoplayContext = createContext<AutoplayContextType>({
  autoplayEnabled: false,
  setAutoplayEnabled: () => {},
});

export function AutoplayProvider({ children }: { children: ReactNode }) {
  const [autoplayEnabled, setAutoplayState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return false;
    }
  });

  const setAutoplayEnabled = useCallback((value: boolean) => {
    setAutoplayState(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }, []);

  return (
    <AutoplayContext.Provider value={{ autoplayEnabled, setAutoplayEnabled }}>
      {children}
    </AutoplayContext.Provider>
  );
}

export const useAutoplay = () => useContext(AutoplayContext);
