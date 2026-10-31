import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppTheme } from '@/contexts/ThemeContext';
import { HALLOWEEN_THEME, isHalloweenDay } from '@/lib/halloween-override';

const HalloweenGhostPopup = lazy(() => import('./HalloweenGhostPopup'));

const SEEN_KEY = 'dehub.halloween2026.ghostSeen';
const DWELL_MS = 2_500;

function seen(): boolean {
  try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
function markSeen() {
  try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

function isFeedPage(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app' || path === '/app/explore';
}

/**
 * Halloween 2026: once per device, while the Horror override is on, a ghost
 * says Happy Halloween and offers the other themes. Renders nothing otherwise.
 */
export function HalloweenGhostPrompt() {
  const { theme } = useAppTheme();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const eligible = theme === HALLOWEEN_THEME && isFeedPage(pathname);

  useEffect(() => {
    if (!eligible || open || !isHalloweenDay() || seen()) return;
    const timer = window.setTimeout(() => {
      if (document.hidden || seen()) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      markSeen();
      setOpen(true);
    }, DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, open]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <HalloweenGhostPopup onClose={() => setOpen(false)} />
    </Suspense>
  );
}
