import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface GlobalFeedNavContextValue {
  /** Inside the nav pill — the filter panel drops out of the bottom of it. */
  filtersPortalElement: HTMLElement | null;
  setFiltersPortalElement: (el: HTMLElement | null) => void;
  /**
   * Below the nav pill, still inside the sticky chrome. The active-filter chips
   * belong here rather than in the pill: they are a description of the feed, not
   * a control on the bar, and rendering them inside made the bar grow a row of
   * badges as if they were part of the navigation.
   */
  chipsPortalElement: HTMLElement | null;
  setChipsPortalElement: (el: HTMLElement | null) => void;
}

const GlobalFeedNavContext = createContext<GlobalFeedNavContextValue | null>(null);

export function GlobalFeedNavProvider({ children }: { children: ReactNode }) {
  const [filtersPortalElement, setFiltersPortalElement] = useState<HTMLElement | null>(null);
  const [chipsPortalElement, setChipsPortalElement] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({
      filtersPortalElement,
      setFiltersPortalElement,
      chipsPortalElement,
      setChipsPortalElement,
    }),
    [filtersPortalElement, chipsPortalElement]
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
