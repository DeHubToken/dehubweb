import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { playMagneticDock } from '@/lib/magnetic-dock';
import { takeMobileBootCover } from '@/lib/mobile-boot-cover';

/** A visible slow-start loader may dock; a ready page never starts a loader. */
export function MagneticDockEntry() {
  const { isAuthenticated, isLoading, requiresUsername } = useAuth();
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const wasLoading = takeMobileBootCover();
    if (!wasLoading || !window.matchMedia('(max-width: 767px)').matches || !isAuthenticated || isLoading || requiresUsername || !isHomeFeedRoute(pathname)) return;
    const root = document.getElementById('app-root');
    if (!root) return;
    return playMagneticDock(root, () => {});
  }, [isAuthenticated, isLoading, requiresUsername, pathname]);
  return null;
}
