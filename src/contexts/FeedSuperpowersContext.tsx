import { createContext, useContext, type ReactNode } from 'react';
import { useSuperpowers } from '@/hooks/use-superpowers';
import type { SuperPowerStatus } from '@/lib/api/dehub/superpowers';

const FeedSuperpowersContext = createContext<SuperPowerStatus | null | undefined>(undefined);

/** A single allowance subscription for all cards; mutations invalidate its query. */
export function FeedSuperpowersProvider({ children }: { children: ReactNode }) {
  const { data } = useSuperpowers();
  return <FeedSuperpowersContext.Provider value={data}>{children}</FeedSuperpowersContext.Provider>;
}

export function useFeedSuperpowers() {
  return useContext(FeedSuperpowersContext);
}
