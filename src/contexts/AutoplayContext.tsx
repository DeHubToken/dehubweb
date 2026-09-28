/**
 * Autoplay Context
 * ================
 * Global setting for video autoplay on scroll. On by default.
 * Persists to localStorage.
 *
 * `autoplayMuted` forces every scroll-autoplayed video to start silent, even
 * after the viewer unmuted one earlier in the session. Tapping play or the
 * speaker icon still gives sound.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

const STORAGE_KEY = 'autoplay-videos';
const DEFAULT_AUTOPLAY = true;
const MUTED_STORAGE_KEY = 'autoplay-muted';
const DEFAULT_AUTOPLAY_MUTED = false;

interface AutoplayContextType {
  autoplayEnabled: boolean;
  setAutoplayEnabled: (value: boolean) => void;
  autoplayMuted: boolean;
  setAutoplayMuted: (value: boolean) => void;
}

const AutoplayContext = createContext<AutoplayContextType>({
  autoplayEnabled: false,
  setAutoplayEnabled: () => {},
  autoplayMuted: DEFAULT_AUTOPLAY_MUTED,
  setAutoplayMuted: () => {},
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

  const [autoplayMuted, setAutoplayMutedState] = useState(() => {
    try {
      const stored = localStorage.getItem(MUTED_STORAGE_KEY);
      return stored === null ? DEFAULT_AUTOPLAY_MUTED : stored === 'true';
    } catch {
      return DEFAULT_AUTOPLAY_MUTED;
    }
  });

  const applyAutoplayMuted = useCallback((v: unknown) => {
    const val = typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : DEFAULT_AUTOPLAY_MUTED;
    setAutoplayMutedState(val);
    try { localStorage.setItem(MUTED_STORAGE_KEY, String(val)); } catch { /* ignore */ }
  }, []);
  const { push: pushAutoplayMuted } = useSyncedPreference('autoplayMuted', autoplayMuted, applyAutoplayMuted, DEFAULT_AUTOPLAY_MUTED);

  const setAutoplayMuted = useCallback((value: boolean) => {
    setAutoplayMutedState(value);
    try { localStorage.setItem(MUTED_STORAGE_KEY, String(value)); } catch { /* ignore */ }
    pushAutoplayMuted(value);
  }, [pushAutoplayMuted]);

  const value = useMemo(
    () => ({ autoplayEnabled, setAutoplayEnabled, autoplayMuted, setAutoplayMuted }),
    [autoplayEnabled, setAutoplayEnabled, autoplayMuted, setAutoplayMuted],
  );

  return (
    <AutoplayContext.Provider value={value}>
      {children}
    </AutoplayContext.Provider>
  );
}

export const useAutoplay = () => useContext(AutoplayContext);
