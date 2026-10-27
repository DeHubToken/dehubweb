import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

const subscribe = (changed: () => void) => {
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
};
const visible = () => document.visibilityState !== 'hidden';
export function useDocumentVisible() { return useSyncExternalStore(subscribe, visible, () => true); }

export function useRouteVisible(route: 'launchpad' | 'dao') {
  const { pathname } = useLocation();
  const shown = useDocumentVisible();
  return shown && new RegExp(`^/(?:app/)?${route}(?:/|$)`).test(pathname);
}
