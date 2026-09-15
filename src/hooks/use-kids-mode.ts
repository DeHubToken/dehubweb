/**
 * Kids Mode Hook
 * ==============
 * One switch with two halves that have to stay in step: a flag on the account,
 * which the API filters on and a client cannot strip, and a lock on this
 * device, which is what puts `X-Kids-Mode` on every request and is the only
 * thing there is when nobody is signed in.
 *
 * The device lock is written only after the server has agreed. Arming it
 * optimistically would leave a device filtered while the account was not, and
 * — worse, on the way out — a failed PIN check would unlock the device.
 *
 * Reads are cheap: the local lock is synchronous and is what the UI renders
 * from, so nothing flashes unlocked while a query resolves. The account query
 * exists to reconcile a device that has been locked by another device, or
 * unlocked while this tab was closed.
 *
 * @module hooks/use-kids-mode
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { disableKidsMode, enableKidsMode, getKidsMode } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { isKidsModeLocked, onKidsModeChange, setKidsModeLocked } from '@/lib/kids-mode-lock';

/**
 * Just the answer: is this device in Kids Mode.
 *
 * Every surface that only *reads* the switch uses this — the nav, the gate, the
 * feed rails, the comment composer. It subscribes to the device lock and
 * nothing else: no query, no auth context, no mutation. That matters beyond
 * tidiness. `useKidsMode` below needs a QueryClient and an AuthProvider above
 * it, and reaching for it from a nav component turned a synchronous boolean
 * into a react-query dependency that broke rendering the sidebar in isolation.
 *
 * `useSyncExternalStore` rather than useState + useEffect so the value is
 * correct on the very first render rather than one commit later — a Kids Mode
 * session must never paint a frame of the adult nav.
 */
export function useKidsModeLock(): boolean {
  return useSyncExternalStore(
    onKidsModeChange,
    isKidsModeLocked,
    // Server snapshot: nothing is locked during SSR/prerender, and the lock is
    // a browser-only concept anyway.
    () => false,
  );
}

/** Everything the feeds and the categories depend on, refetched when the switch moves. */
const KIDS_SENSITIVE_QUERIES = [
  'unified-feed',
  'dehub-feed',
  'dehub-categories',
  'dehub-user-content',
  'dehub-live',
  'search',
  'superpower-slot',
];

export function useKidsMode() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Rendered from the device lock, not the query: the lock is synchronous and
  // correct on the first paint, and a Kids Mode session must never show a
  // single frame of the adult UI while a request is in flight.
  const [locked, setLocked] = useState<boolean>(() => isKidsModeLocked());

  useEffect(() => onKidsModeChange(setLocked), []);

  const { data: account } = useQuery({
    queryKey: ['kids-mode'],
    queryFn: getKidsMode,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Reconcile a device whose lock disagrees with the account it is signed into
  // — Kids Mode armed from a phone, or turned off somewhere else. The account
  // wins in both directions; it is the half a client cannot fake.
  useEffect(() => {
    if (!isAuthenticated || account === undefined) return;
    if (account.enabled !== isKidsModeLocked()) setKidsModeLocked(account.enabled);
  }, [isAuthenticated, account]);

  const refetchFiltered = useCallback(() => {
    for (const key of KIDS_SENSITIVE_QUERIES) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    // The feeds are filtered server-side on this, so cached pages have to be
    // refetched rather than patched — turning it on removes posts that are
    // already in the cache, and turning it off adds ones that never were.
    queryClient.invalidateQueries({ queryKey: ['kids-mode'] });
  }, [queryClient]);

  const enable = useMutation({
    mutationFn: (pin: string) => enableKidsMode(pin),
    onSuccess: () => {
      setKidsModeLocked(true);
      refetchFiltered();
      toast.success('Kids Mode is on');
    },
  });

  const disable = useMutation({
    mutationFn: (pin: string) => disableKidsMode(pin),
    onSuccess: () => {
      setKidsModeLocked(false);
      refetchFiltered();
      toast.success('Kids Mode is off');
    },
  });

  return {
    /** What the UI renders from. True the moment the device is locked. */
    isKidsMode: locked,
    /** Turn it on with a new PIN. Resolves on success, rejects with the server's message. */
    enable: enable.mutateAsync,
    /** Turn it off with the PIN. Rejects on a wrong PIN or while the pad is locked. */
    disable: disable.mutateAsync,
    isSaving: enable.isPending || disable.isPending,
  };
}
