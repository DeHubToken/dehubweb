/**
 * FeedDefaultsSync — carries the default feed tab and the saved feed toggles
 * between this browser and the account.
 *
 * Renders nothing. The feeds read and write the localStorage copy
 * (lib/feed-defaults) synchronously; this owns the round trip: the account's
 * values in on sign-in, and a debounced profile save whenever a default
 * changes here. The keys live in `customs`, which the backend replaces whole,
 * so a save spreads over the freshest profile copy it has.
 *
 * @module components/app/FeedDefaultsSync
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { updateProfile } from '@/lib/api/dehub';
import {
  FEED_DEFAULTS_CHANGED_EVENT,
  FEED_TOGGLES_RELOAD_EVENT,
  adoptAccountFeedDefaults,
  feedDefaultsCustoms,
  moveToAccountDefaultTab,
} from '@/lib/feed-defaults';

const SAVE_DELAY_MS = 1500;

export function FeedDefaultsSync() {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = !!walletAddress && isAuthenticated;
  const { data: profile, isFetched } = useDeHubProfile({
    userId: walletAddress || undefined,
    enabled: signedIn,
  });
  const customsRef = useRef<Record<string, unknown> | undefined>(undefined);
  customsRef.current = profile?.customs as Record<string, unknown> | undefined;
  const adoptedFor = useRef<string | null>(null);
  // Set while our own save is in flight, so its echo is not adopted back.
  const savingRef = useRef(false);

  // Account in: once per sign-in, when the profile has loaded.
  useEffect(() => {
    if (!signedIn || !walletAddress) { adoptedFor.current = null; return; }
    if (!isFetched || !profile || adoptedFor.current === walletAddress || savingRef.current) return;
    adoptedFor.current = walletAddress;
    const { hasTab, hasToggles, tabChanged, togglesChanged } = adoptAccountFeedDefaults(customsRef.current);
    if (tabChanged) moveToAccountDefaultTab();
    if (togglesChanged) {
      // Only feeds without a choice made this session pick the account's up.
      let sessionHasChoices = false;
      try { sessionHasChoices = !!sessionStorage.getItem('feed-filter-states'); } catch { /* ignore */ }
      if (!sessionHasChoices) {
        window.dispatchEvent(new CustomEvent(FEED_TOGGLES_RELOAD_EVENT));
        window.dispatchEvent(new CustomEvent('feed-filters-changed'));
      }
    }
    // Defaults set on this device before the account had any: send them up.
    if (!hasTab || !hasToggles) window.dispatchEvent(new CustomEvent(FEED_DEFAULTS_CHANGED_EVENT));
  }, [signedIn, walletAddress, isFetched, profile]);

  // Changes out: debounced, merged over the latest customs.
  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = async () => {
      timer = null;
      const existing = (customsRef.current ?? {}) as Record<string, string | number | boolean>;
      const next = feedDefaultsCustoms();
      if (Object.entries(next).every(([k, v]) => existing[k] === v)) return;
      savingRef.current = true;
      try {
        await updateProfile({ customs: { ...existing, ...next } });
        customsRef.current = { ...existing, ...next };
        await queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      } catch (error) {
        console.warn('[feed-defaults] save failed', error);
      } finally {
        savingRef.current = false;
      }
    };
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    };
    window.addEventListener(FEED_DEFAULTS_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(FEED_DEFAULTS_CHANGED_EVENT, onChange);
      if (timer) { clearTimeout(timer); void save(); }
    };
  }, [signedIn, queryClient]);

  return null;
}
