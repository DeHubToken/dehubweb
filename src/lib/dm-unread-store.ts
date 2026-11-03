import { useSyncExternalStore } from 'react';

/**
 * Total unread DM count for the nav badges.
 *
 * The nav used to call useTotalUnreadCount() from hooks/use-messages directly,
 * which put the whole messaging stack (DM API, end-to-end crypto, the DM
 * socket) into the boot file for every visitor. The count is now published
 * here by DmUnreadBridge, which loads that stack after the first paint and
 * only for signed-in visitors.
 */
let count = 0;
const listeners = new Set<() => void>();

export function setDmUnreadCount(next: number): void {
  if (next === count) return;
  count = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => count;

export function useDmUnreadCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
