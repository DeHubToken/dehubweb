import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface GlobalFeedNavContextValue {
  filtersPortalElement: HTMLElement | null;
  setFiltersPortalElement: (el: HTMLElement | null) => void;
}

const GlobalFeedNavContext = createContext<GlobalFeedNavContextValue | null>(null);

export function GlobalFeedNavProvider({ children }: { children: ReactNode }) {
  const [filtersPortalElement, setFiltersPortalElement] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ filtersPortalElement, setFiltersPortalElement }),
    [filtersPortalElement]
  );
  return (
    <GlobalFeedNavContext.Provider value={value}>
      {children}
    </GlobalFeedNavContext.Provider>
  );
}

export function useGlobalFeedNav() {
  return useContext(GlobalFeedNavContext);
}
