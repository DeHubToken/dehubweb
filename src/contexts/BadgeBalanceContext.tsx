/**
 * Badge Balance Context
 * =====================
 * Collects wallet addresses from rendered cards and fetches
 * all badge balances in a single batch request instead of N individual calls.
 */

import { createContext, useContext, useCallback, useRef, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const BATCH_DELAY_MS = 100; // Debounce to collect addresses before firing

interface BadgeBalanceContextValue {
  /** Register an address to be included in the next batch fetch */
  registerAddress: (address: string) => void;
  /** Get cached balance for an address (undefined = not yet fetched) */
  getBalance: (address: string) => number | undefined;
  /** Whether any batch is currently loading */
  isLoading: boolean;
}

const BadgeBalanceContext = createContext<BadgeBalanceContextValue | null>(null);

async function fetchBatchBadgeBalances(addresses: string[]): Promise<Record<string, number>> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-badge-balance?addresses=${encodeURIComponent(addresses.join(','))}`;
  const response = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Batch badge balance fetch failed: ${response.status}`);
  }

  const json = await response.json();
  return json.results ?? {};
}

export function BadgeBalanceProvider({ children }: { children: ReactNode }) {
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  const flushBatch = useCallback(async () => {
    const addresses = Array.from(pendingRef.current);
    pendingRef.current.clear();
    
    if (addresses.length === 0) return;

    // Filter out addresses we already have
    const needed = addresses.filter(a => !(a in balances));
    if (needed.length === 0) return;

    const sorted = [...new Set(needed.map(a => a.toLowerCase()))].sort();

    setIsLoading(true);
    try {
      const results = await fetchBatchBadgeBalances(sorted);
      
      setBalances(prev => ({ ...prev, ...results }));
      
      // Also populate individual query cache entries so useBadgeBalance consumers
      // (profile page, chat) get cache hits
      for (const [addr, balance] of Object.entries(results)) {
        queryClient.setQueryData(['badge-balance', addr.toLowerCase()], balance);
      }
    } catch (err) {
      console.error('Badge batch fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [balances, queryClient]);

  const registerAddress = useCallback((address: string) => {
    if (!address) return;
    const lower = address.toLowerCase();
    
    // Skip if we already have it
    if (lower in balances) return;
    
    pendingRef.current.add(lower);
    
    // Debounce: wait for more registrations before firing
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushBatch, BATCH_DELAY_MS);
  }, [balances, flushBatch]);

  const getBalance = useCallback((address: string) => {
    return balances[address.toLowerCase()];
  }, [balances]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <BadgeBalanceContext.Provider value={{ registerAddress, getBalance, isLoading }}>
      {children}
    </BadgeBalanceContext.Provider>
  );
}

/**
 * Hook to get badge balance from the batch context.
 * Falls back to individual fetch if no provider is present.
 */
export function useBatchedBadgeBalance(address?: string | null) {
  const ctx = useContext(BadgeBalanceContext);
  
  // Register address on mount
  useEffect(() => {
    if (ctx && address) {
      ctx.registerAddress(address);
    }
  }, [ctx, address]);

  if (!ctx || !address) {
    return { badgeBalance: undefined, isLoading: false };
  }

  return {
    badgeBalance: ctx.getBalance(address),
    isLoading: ctx.isLoading,
  };
}
