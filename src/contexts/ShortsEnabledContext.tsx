/**
 * Shorts Enabled Context
 * ======================
 * Global setting to enable/disable Shorts across the app.
 * When disabled: the Shorts feed tab is hidden and Shorts carousels are
 * removed from the Home feed.
 *
 * Persistence:
 *  - Signed-in users: stored on their DeHub profile under `customs.shortsEnabled`
 *    ('true' | 'false') so the preference follows the account across devices.
 *  - localStorage is used only as an instant-paint cache to avoid a flicker
 *    while the profile query hydrates, and as a fallback for signed-out users.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProfile } from '@/lib/api/dehub';
import { toast } from 'sonner';

const CACHE_KEY = 'shorts-enabled';
const CUSTOMS_KEY = 'shortsEnabled';

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
  const queryClient = useQueryClient();

  const [shortsEnabled, setShortsState] = useState<boolean>(readCache);

  const { data: profile } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: !!walletAddress && isAuthenticated,
  });

  // Hydrate from server preference once the profile loads. Server wins.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!profile) return;
    const raw = (profile.customs as Record<string, string> | undefined)?.[CUSTOMS_KEY];
    const serverValue = raw === undefined ? true : raw !== 'false';
    hydratedRef.current = true;
    setShortsState(serverValue);
    writeCache(serverValue);
  }, [profile]);

  const mutation = useMutation({
    mutationFn: async (value: boolean) => {
      const existing = (profile?.customs ?? {}) as Record<string, string>;
      await updateProfile({
        customs: { ...existing, [CUSTOMS_KEY]: String(value) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
    },
    onError: (err, value) => {
      console.error('Failed to save Shorts preference:', err);
      toast.error('Failed to save Shorts preference');
      // Roll back to previous server value if we have one, else previous cache.
      const raw = (profile?.customs as Record<string, string> | undefined)?.[CUSTOMS_KEY];
      const prev = raw === undefined ? !value : raw !== 'false';
      setShortsState(prev);
      writeCache(prev);
    },
  });

  const setShortsEnabled = useCallback((value: boolean) => {
    // Optimistic local update + cache for instant paint on next load.
    setShortsState(value);
    writeCache(value);
    if (isAuthenticated && walletAddress) {
      mutation.mutate(value);
    }
  }, [isAuthenticated, walletAddress, mutation]);

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
    <ShortsEnabledContext.Provider value={{ shortsEnabled, setShortsEnabled, isUpdating: mutation.isPending }}>
      {children}
    </ShortsEnabledContext.Provider>
  );
}

export const useShortsEnabled = () => useContext(ShortsEnabledContext);
