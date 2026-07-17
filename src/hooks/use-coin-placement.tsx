import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface CoinPlacementContextType {
  stickToBanner: boolean;
  setStickToBanner: (value: boolean) => void;
}

const CoinPlacementContext = createContext<CoinPlacementContextType | undefined>(undefined);

const STORAGE_KEY = 'dehub-coin-placement';

export function CoinPlacementProvider({ children }: { children: ReactNode }) {
  const [stickToBanner, setStickToBannerState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  const setStickToBanner = (value: boolean) => {
    setStickToBannerState(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <CoinPlacementContext.Provider value={{ stickToBanner, setStickToBanner }}>
      {children}
    </CoinPlacementContext.Provider>
  );
}

export function useCoinPlacement() {
  const context = useContext(CoinPlacementContext);
  if (!context) {
    throw new Error('useCoinPlacement must be used within a CoinPlacementProvider');
  }
  return context;
}
