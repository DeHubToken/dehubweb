import { useContext, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { notifyRouteContentReady } from '@/lib/route-loading-shell';

/** A lazy route may paint its own data skeleton as soon as its code is ready. */
export function useRouteContentReady(active = true): void {
  const location = useLocation();
  const visible = useContext(CachedPageActiveContext);
  useLayoutEffect(() => {
    if (active && visible) notifyRouteContentReady(location.key);
  }, [active, visible, location.key]);
}

export function RouteContentReady({ active }: { active: boolean }) {
  useRouteContentReady(active);
  return null;
}
