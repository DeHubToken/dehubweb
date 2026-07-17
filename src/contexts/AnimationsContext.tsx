/**
 * Animations Context
 * ==================
 * Global setting to enable/disable animations. On by default.
 * When disabled, adds `reduce-motion` class to <html> which CSS uses to kill animations.
 * Persists to localStorage.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

const STORAGE_KEY = 'show-animations';
const DEFAULT_ANIMATIONS = true;

interface AnimationsContextType {
  animationsEnabled: boolean;
  setAnimationsEnabled: (value: boolean) => void;
}

const AnimationsContext = createContext<AnimationsContextType>({
  animationsEnabled: true,
  setAnimationsEnabled: () => {},
});

export function AnimationsProvider({ children }: { children: ReactNode }) {
  const [animationsEnabled, setAnimationsState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? DEFAULT_ANIMATIONS : stored === 'true';
    } catch {
      return DEFAULT_ANIMATIONS;
    }
  });

  // Reconcile inbound synced value (server → local) for the signed-in account.
  const applyAnimations = useCallback((v: unknown) => {
    const val = typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : DEFAULT_ANIMATIONS;
    setAnimationsState(val);
    try { localStorage.setItem(STORAGE_KEY, String(val)); } catch { /* ignore */ }
  }, []);
  const { push: pushAnimations } = useSyncedPreference('animations', animationsEnabled, applyAnimations, DEFAULT_ANIMATIONS);

  const setAnimationsEnabled = useCallback((value: boolean) => {
    setAnimationsState(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* ignore */ }
    pushAnimations(value);
  }, [pushAnimations]);

  // Sync class on <html> element
  useEffect(() => {
    if (animationsEnabled) {
      document.documentElement.classList.remove('reduce-motion');
    } else {
      document.documentElement.classList.add('reduce-motion');
    }
  }, [animationsEnabled]);

  return (
    <AnimationsContext.Provider value={{ animationsEnabled, setAnimationsEnabled }}>
      <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
        {children}
      </MotionConfig>
    </AnimationsContext.Provider>
  );
}

export const useAnimations = () => useContext(AnimationsContext);
