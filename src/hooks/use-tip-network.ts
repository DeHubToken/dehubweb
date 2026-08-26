/**
 * Tip network preference.
 *
 * Which chain a tip's DHB leaves on. The default is `auto`, and it is the
 * default because it is the right answer for almost everybody: the tip goes
 * from whichever chain the tipper's DHB is actually sitting on, Base first,
 * read at send time.
 *
 * The tip drawer used to ask this outright, above the amount, which made the
 * first thing anyone saw when sending money a question about infrastructure.
 * People who genuinely want to pin a chain — a creator paying from one
 * treasury, somebody keeping gas on one network — can still say so; it just
 * lives in Settings now rather than in the way.
 *
 * Device-local on purpose, like the wallet-unlock interval next to it. It
 * describes where *this* browser's coins are, and a named account setting would
 * need a backend column to survive at all — `customs` silently drops named keys.
 */
import { useState, useCallback } from 'react';
import { BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

export const TIP_NETWORK_KEY = 'dehub_tip_network';

export type TipNetworkOption = 'auto' | 'base' | 'bnb';

export const DEFAULT_TIP_NETWORK: TipNetworkOption = 'auto';

/** null = decide from the balance at send time. */
const PINNED_CHAIN: Record<TipNetworkOption, ChainId | null> = {
  auto: null,
  base: BASE_CHAIN_ID as ChainId,
  bnb: BNB_CHAIN_ID as ChainId,
};

function isOption(v: string | null): v is TipNetworkOption {
  return !!v && v in PINNED_CHAIN;
}

function readOption(): TipNetworkOption {
  try {
    const stored = localStorage.getItem(TIP_NETWORK_KEY);
    return isOption(stored) ? stored : DEFAULT_TIP_NETWORK;
  } catch {
    return DEFAULT_TIP_NETWORK;
  }
}

/** Plain reader for the send path. null means "work it out from the balance". */
export function getPinnedTipChainId(): ChainId | null {
  return PINNED_CHAIN[readOption()];
}

export function useTipNetwork() {
  const [option, setOptionState] = useState<TipNetworkOption>(readOption);

  const setOption = useCallback((next: TipNetworkOption) => {
    try { localStorage.setItem(TIP_NETWORK_KEY, next); } catch { /* ignore */ }
    setOptionState(next);
  }, []);

  return { option, setOption, pinnedChainId: PINNED_CHAIN[option] };
}
