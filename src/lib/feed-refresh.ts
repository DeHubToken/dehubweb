import { useSyncExternalStore } from 'react';
export interface FeedRefreshState { refreshing: boolean; progress: number }
const idle: FeedRefreshState = { refreshing: false, progress: 0 };
let state = idle;
const listeners = new Set<() => void>();
export function setFeedRefresh(next: FeedRefreshState) {
  if (state.refreshing === next.refreshing && state.progress === next.progress) return;
  state = next;
  listeners.forEach(fn => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useFeedRefresh = () => useSyncExternalStore(subscribe, () => state, () => idle);
