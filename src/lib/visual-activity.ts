import { useContext, useSyncExternalStore } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

export function createVisualActivity() {
  let foreground = true;
  let focused = true;
  let callBusy = false;
  let callCovered = false;
  let settled = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const settle = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    settled = false;
    notify();
    if (foreground && focused) {
      timer = setTimeout(() => { timer = null; settled = true; notify(); }, 250);
    }
  };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isVisualActive: () => foreground && focused && settled && !callCovered,
    isForeground: () => foreground && focused,
    isCallBusy: () => callBusy,
    isFeedPlaybackAllowed: () => foreground && focused && settled && !callBusy,
    /**
     * A live someone is watching keeps playing with the tab in the background
     * or the window unfocused: a live has nothing to come back to, so pausing
     * it is the same as dropping the viewer out of the room. Only a call
     * stops it.
     */
    isLivePlaybackAllowed: () => !callBusy,
    setForeground: (next: boolean) => { if (foreground !== next) { foreground = next; settle(); } },
    setFocused: (next: boolean) => { if (focused !== next) { focused = next; settle(); } },
    setCall: (busy: boolean, covered: boolean) => {
      if (callBusy === busy && callCovered === covered) return;
      callBusy = busy;
      callCovered = covered;
      settle();
    },
    dispose: () => { if (timer) clearTimeout(timer); timer = null; listeners.clear(); },
  };
}

export const visualActivity = createVisualActivity();
export const useFeedPlaybackAllowed = () => {
  const surfaceActive = useContext(CachedPageActiveContext);
  const appActive = useSyncExternalStore(visualActivity.subscribe, visualActivity.isFeedPlaybackAllowed, () => true);
  return surfaceActive && appActive;
};
/** {@link useFeedPlaybackAllowed} for a live the viewer is watching: hidden tabs and blur don't stop it. */
export const useLivePlaybackAllowed = () => {
  const surfaceActive = useContext(CachedPageActiveContext);
  const appActive = useSyncExternalStore(visualActivity.subscribe, visualActivity.isLivePlaybackAllowed, () => true);
  return surfaceActive && appActive;
};
export const useCallInProgress = () =>
  useSyncExternalStore(visualActivity.subscribe, visualActivity.isCallBusy, () => false);

export function trackVisualActivity(): () => void {
  const visibility = () => visualActivity.setForeground(document.visibilityState !== 'hidden');
  const blur = () => visualActivity.setFocused(false);
  const focus = () => visualActivity.setFocused(true);
  visibility();
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
  };
}

