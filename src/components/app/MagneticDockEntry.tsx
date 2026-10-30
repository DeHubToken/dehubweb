import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { playMagneticDock } from '@/lib/magnetic-dock';

/** Once on signed-in entry; ordinary feed navigation and refresh stay immediate. */
export function MagneticDockEntry() {
  const { isAuthenticated, isLoading, requiresUsername } = useAuth();
  const { pathname } = useLocation();
  const played = useRef(false);
  useLayoutEffect(() => {
    if (!isAuthenticated) { played.current = false; return; }
    if (isLoading || requiresUsername || played.current || !isHomeFeedRoute(pathname)) return;
    const root = document.getElementById('app-root');
    if (!root) return;
    return playMagneticDock(root, () => { played.current = true; });
  }, [isAuthenticated, isLoading, requiresUsername, pathname]);
  return null;
}
