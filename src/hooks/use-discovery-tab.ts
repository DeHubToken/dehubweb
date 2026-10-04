import { useCallback, useSyncExternalStore } from 'react';

export type DiscoveryTab = 'posts' | 'stages' | 'tickers';
export type DiscoverySurface = 'sidebar' | 'explore';
let selection: Record<DiscoverySurface, DiscoveryTab> = { sidebar: 'posts', explore: 'tickers' };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function selectDiscoveryTab(surface: DiscoverySurface, tab: DiscoveryTab) {
  const other = surface === 'sidebar' ? 'explore' : 'sidebar';
  const previous = selection[surface];
  if (previous === tab) return;
  selection = {
    ...selection,
    [surface]: tab,
    // Swap when the reader selects the other panel's category. Both panels
    // update together, including after returning to a cached Explore page.
    [other]: selection[other] === tab ? previous : selection[other],
  };
  listeners.forEach(listener => listener());
}

export function useDiscoveryTab(surface: DiscoverySurface) {
  const activeTab = useSyncExternalStore(subscribe, () => selection[surface], () => selection[surface]);
  const setActiveTab = useCallback((tab: DiscoveryTab) => selectDiscoveryTab(surface, tab), [surface]);
  return [activeTab, setActiveTab] as const;
}
