/**
 * Shared Follow State
 * ===================
 * Module-level follow-override store shared by every surface that renders a
 * Follow button (feed cards, hover cards, suggestions, drawers, shorts, …).
 *
 * Toggling flips the override immediately — all subscribed surfaces re-render
 * instantly — then fires the API call in the background and rolls back (with
 * an error toast) on failure. No loading spinners: the flip is optimistic.
 *
 * Surfaces read the override first and fall back to their own server-derived
 * value, so the same user never shows "Follow" on one card and "Following"
 * on another.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { followUser, unfollowUser } from '@/lib/api/dehub';
import type { ProfileData } from '@/hooks/use-dehub-profile';

/** Optimistic overrides: lowercased wallet address -> isFollowing */
let overrides = new Map<string, boolean>();
/** Addresses with an in-flight follow/unfollow call (guards double toggles) */
let pendingAddresses = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(cb => cb());
}

export function subscribeFollowState(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Current optimistic override for an address, or undefined when none is set */
export function getFollowOverride(address?: string | null): boolean | undefined {
  return address ? overrides.get(address.toLowerCase()) : undefined;
}

/** Set the optimistic follow state for an address (notifies all surfaces) */
export function setFollowOverride(address: string, isFollowing: boolean) {
  overrides = new Map(overrides).set(address.toLowerCase(), isFollowing);
  emit();
}

function revertFollowOverride(address: string, previous: boolean | undefined) {
  const next = new Map(overrides);
  if (previous === undefined) next.delete(address.toLowerCase());
  else next.set(address.toLowerCase(), previous);
  overrides = next;
  emit();
}

/**
 * Patch any cached ['dehub-profile'] entries for this user in place.
 * Never invalidates/refetches — just adjusts isFollowing + follower count.
 */
function patchProfileCaches(queryClient: QueryClient, address: string, isFollowing: boolean, delta: 1 | -1) {
  const lower = address.toLowerCase();
  queryClient.setQueriesData<ProfileData | undefined>({ queryKey: ['dehub-profile'] }, (old) => {
    if (!old || old.walletAddress?.toLowerCase() !== lower) return old;
    return {
      ...old,
      isFollowing,
      followers: Math.max(0, old.followers + delta),
    };
  });
}

export interface ToggleFollowOptions {
  /** Display name used in toasts */
  name?: string;
  /** Suppress the built-in success/info toasts */
  silent?: boolean;
  /**
   * Called after rollback on failure. When provided, the built-in error toast
   * is skipped so the caller can surface its own (e.g. reauth handling).
   */
  onError?: (error: unknown) => void;
  onSuccess?: (isFollowing: boolean) => void;
}

/**
 * Optimistically follow/unfollow `address`. Flips the shared override first
 * (instant UI everywhere), then calls the API; reverts + toasts on error.
 * Usable outside React components (list rows) — pass the queryClient in.
 */
export async function toggleFollowFor(
  queryClient: QueryClient,
  address: string,
  currentlyFollowing: boolean,
  opts: ToggleFollowOptions = {}
): Promise<boolean> {
  const lower = address.toLowerCase();
  if (pendingAddresses.has(lower)) return false;

  const previous = overrides.get(lower);
  const next = !currentlyFollowing;
  const name = opts.name || 'user';

  // Optimistic flip — every subscribed surface updates instantly
  pendingAddresses = new Set(pendingAddresses).add(lower);
  setFollowOverride(address, next);
  patchProfileCaches(queryClient, address, next, next ? 1 : -1);

  try {
    if (next) await followUser(address);
    else await unfollowUser(address);
    if (!opts.silent) {
      toast.success(next ? `Following ${name}!` : `Unfollowed ${name}`);
    }
    opts.onSuccess?.(next);
    return true;
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (next && (msg.includes('already') || msg.includes('following'))) {
      // Server already agrees — keep the optimistic "following" state
      if (!opts.silent) toast.info(`Already following ${name}`);
      opts.onSuccess?.(next);
      return true;
    }
    // Roll back the optimistic flip
    revertFollowOverride(address, previous);
    patchProfileCaches(queryClient, address, currentlyFollowing, next ? -1 : 1);
    if (opts.onError) opts.onError(error);
    else toast.error(next ? 'Failed to follow' : 'Failed to unfollow');
    return false;
  } finally {
    const nextPending = new Set(pendingAddresses);
    nextPending.delete(lower);
    pendingAddresses = nextPending;
    emit();
  }
}

/**
 * Subscribe to the whole override map — for surfaces that render lists of
 * users inline. Read with `map.get(address.toLowerCase())`.
 */
export function useFollowOverrides(): ReadonlyMap<string, boolean> {
  return useSyncExternalStore(subscribeFollowState, () => overrides, () => overrides);
}

/**
 * Follow state + optimistic toggle for a single target user.
 * `isFollowing` is the shared override (undefined when untouched) — surfaces
 * should fall back to their server-derived value: `override ?? serverValue`.
 */
export function useFollow(targetAddress?: string | null) {
  const queryClient = useQueryClient();
  const lower = targetAddress?.toLowerCase();

  const isFollowing = useSyncExternalStore(
    subscribeFollowState,
    () => (lower ? overrides.get(lower) : undefined),
    () => (lower ? overrides.get(lower) : undefined),
  );
  const isPending = useSyncExternalStore(
    subscribeFollowState,
    () => (lower ? pendingAddresses.has(lower) : false),
    () => false,
  );

  const toggleFollow = useCallback(
    (currentlyFollowing: boolean, opts: ToggleFollowOptions = {}) => {
      if (!targetAddress) return Promise.resolve(false);
      return toggleFollowFor(queryClient, targetAddress, currentlyFollowing, opts);
    },
    [queryClient, targetAddress]
  );

  return { isFollowing, toggleFollow, isPending };
}
