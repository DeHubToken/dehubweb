/**
 * Animations Context
 * ==================
 * Global setting to enable/disable animations. On by default.
 * When disabled, adds `reduce-motion` class to <html> which CSS uses to kill animations.
 * Persists to localStorage.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';

const STORAGE_KEY = 'show-animations';

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
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const setAnimationsEnabled = useCallback((value: boolean) => {
    setAnimationsState(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }, []);

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
