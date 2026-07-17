import { createContext, useContext, useState, type ReactNode } from 'react';

interface GlobalFeedNavContextValue {
  filtersPortalElement: HTMLElement | null;
  setFiltersPortalElement: (el: HTMLElement | null) => void;
}

const GlobalFeedNavContext = createContext<GlobalFeedNavContextValue | null>(null);

export function GlobalFeedNavProvider({ children }: { children: ReactNode }) {
  const [filtersPortalElement, setFiltersPortalElement] = useState<HTMLElement | null>(null);
  return (
    <GlobalFeedNavContext.Provider value={{ filtersPortalElement, setFiltersPortalElement }}>
      {children}
    </GlobalFeedNavContext.Provider>
  );
}

export function useGlobalFeedNav() {
  return useContext(GlobalFeedNavContext);
}
