/**
 * Autoplay Context
 * ================
 * Global setting for video autoplay on scroll. Off by default.
 * Persists to localStorage.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

const STORAGE_KEY = 'autoplay-videos';
const DEFAULT_AUTOPLAY = true;

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
      return stored === null ? DEFAULT_AUTOPLAY : stored === 'true';
    } catch {
      return DEFAULT_AUTOPLAY;
    }
  });

  // Reconcile inbound synced value (server → local) for the signed-in account.
  const applyAutoplay = useCallback((v: unknown) => {
    const val = typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : DEFAULT_AUTOPLAY;
    setAutoplayState(val);
    try { localStorage.setItem(STORAGE_KEY, String(val)); } catch { /* ignore */ }
  }, []);
  const { push: pushAutoplay } = useSyncedPreference('autoplay', autoplayEnabled, applyAutoplay, DEFAULT_AUTOPLAY);

  const setAutoplayEnabled = useCallback((value: boolean) => {
    setAutoplayState(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* ignore */ }
    pushAutoplay(value);
  }, [pushAutoplay]);

  return (
    <AutoplayContext.Provider value={{ autoplayEnabled, setAutoplayEnabled }}>
      {children}
    </AutoplayContext.Provider>
  );
}

export const useAutoplay = () => useContext(AutoplayContext);
