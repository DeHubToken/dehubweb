import { useState, useCallback, useSyncExternalStore } from 'react';

/**
 * Module-level store for users followed via suggestions.
 * Persists across tab switches (component unmount/remount) but
 * resets on hard refresh — exactly the desired session behaviour.
 */
let followedSet = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return followedSet;
}

function addFollowed(address: string) {
  followedSet = new Set(followedSet).add(address);
  listeners.forEach(cb => cb());
}

function removeFollowed(address: string) {
  const next = new Set(followedSet);
  next.delete(address);
  followedSet = next;
  listeners.forEach(cb => cb());
}

/**
 * Hook that returns the session-level followed-users set and add/remove functions.
 * Multiple components share the same backing store so follows in the sidebar
 * are also hidden in the mobile carousel and vice-versa.
 * `unmarkFollowed` re-surfaces a suggestion when an optimistic follow fails.
 */
export function useFollowedSuggestions() {
  const followed = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { followedUsers: followed, markFollowed: addFollowed, unmarkFollowed: removeFollowed };
}
