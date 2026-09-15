/**
 * Kids Mode Gate
 * ==============
 * Wraps the routed app and sends anything outside the Kids Mode allowlist back
 * to Home.
 *
 * It is a navigation guard, not a security boundary — the API is already
 * filtered and a route that renders would still be served nothing. What this
 * stops is the shape of the product: a child tapping into Messages and finding
 * an empty inbox, or into the wallet and finding a Send button, is a worse
 * answer than never getting there.
 *
 * A redirect rather than a blocking screen, deliberately. The one thing a
 * child can reliably do is tap, so a dead end they have to read their way out
 * of is a dead end they are stuck in.
 *
 * This is also the one place that mounts the FULL `useKidsMode` — it sits
 * app-wide inside both the QueryClient and the AuthProvider, which is what the
 * account reconciliation needs. Everywhere else reads `useKidsModeLock`, a
 * plain subscription with no providers behind it, so a nav component can still
 * be rendered on its own.
 *
 * @module components/app/KidsModeGate
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isKidsModePath } from '@/constants/app.constants';
import { useKidsMode } from '@/hooks/use-kids-mode';

export function KidsModeGate({ children }: { children: React.ReactNode }) {
  const { isKidsMode } = useKidsMode();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isKidsMode) return;
    if (isKidsModePath(location.pathname)) return;

    navigate('/app', { replace: true });
  }, [isKidsMode, location.pathname, navigate]);

  return <>{children}</>;
}
