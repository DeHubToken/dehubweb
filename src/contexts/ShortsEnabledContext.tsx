/**
 * Shorts Enabled Context
 * ======================
 * Global setting to enable/disable Shorts across the app.
 * When disabled: the Shorts feed tab is hidden and Shorts carousels are
 * removed from the Home feed.
 *
 * Persistence:
 *  - Signed-in wallets: hard-saved to `user_display_preferences.shorts_enabled`
 *    (Supabase, wallet-scoped RLS) so the preference follows the account.
 *  - localStorage mirrors the value for instant paint on next load and as a
 *    fallback for signed-out users.
 *
 * The toggle updates the UI OPTIMISTICALLY — the switch flips the moment it's
 * clicked and only rolls back if the server save actually fails.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';

const CACHE_KEY = 'shorts-enabled';

interface ShortsEnabledContextType {
  shortsEnabled: boolean;
  setShortsEnabled: (value: boolean) => void;
  isUpdating: boolean;
}

const ShortsEnabledContext = createContext<ShortsEnabledContextType>({
  shortsEnabled: true,
  setShortsEnabled: () => {},
  isUpdating: false,
});

function readCache(): boolean {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function writeCache(value: boolean) {
  try { localStorage.setItem(CACHE_KEY, String(value)); } catch {}
}

export function ShortsEnabledProvider({ children }: { children: ReactNode }) {
  const { walletAddress, isAuthenticated } = useAuth();

  const [shortsEnabled, setShortsState] = useState<boolean>(readCache);
  const [isUpdating, setIsUpdating] = useState(false);

  // Hydrate from server once we know the wallet. Server wins over cache.
  useEffect(() => {
    let cancelled = false;
    if (!walletAddress || !isAuthenticated) return;
    (async () => {
      try {
        const { data, error } = await withWalletHeader(
          supabase
            .from('user_display_preferences')
            .select('shorts_enabled')
            .eq('wallet_address', walletAddress.toLowerCase())
            .maybeSingle(),
          walletAddress
        );
        if (cancelled) return;
        if (error) return;
        if (data && typeof (data as any).shorts_enabled === 'boolean') {
          const serverValue = (data as any).shorts_enabled as boolean;
          setShortsState(serverValue);
          writeCache(serverValue);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [walletAddress, isAuthenticated]);

  // Prevent rapid-fire clicks from racing each other.
  const pendingRef = useRef<Promise<unknown> | null>(null);

  const persist = useCallback(async (value: boolean) => {
    if (!walletAddress) return;
    const addr = walletAddress.toLowerCase();
    const { error } = await withWalletHeader(
      supabase
        .from('user_display_preferences')
        .upsert(
          { wallet_address: addr, shorts_enabled: value },
          { onConflict: 'wallet_address' }
        ),
      walletAddress
    );
    if (error) throw error;
  }, [walletAddress]);

  const setShortsEnabled = useCallback((value: boolean) => {
    const previous = shortsEnabled;
    // Optimistic: flip UI + cache instantly.
    setShortsState(value);
    writeCache(value);

    if (!isAuthenticated || !walletAddress) return;

    setIsUpdating(true);
    const run = (async () => {
      try {
        await persist(value);
      } catch (err) {
        console.error('Failed to save Shorts preference:', err);
        toast.error('Failed to save Shorts preference');
        setShortsState(previous);
        writeCache(previous);
      } finally {
        if (pendingRef.current === run) setIsUpdating(false);
      }
    })();
    pendingRef.current = run;
  }, [shortsEnabled, isAuthenticated, walletAddress, persist]);

  // Cross-tab sync of cached value.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY && e.newValue !== null) {
        setShortsState(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <ShortsEnabledContext.Provider value={{ shortsEnabled, setShortsEnabled, isUpdating }}>
      {children}
    </ShortsEnabledContext.Provider>
  );
}

export const useShortsEnabled = () => useContext(ShortsEnabledContext);
