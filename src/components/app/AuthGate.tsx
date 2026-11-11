/**
 * Auth Gate
 * =========
 * What an account-only page (Notifications, Messages, Settings, Wallet...)
 * renders for somebody who is not signed in. There is no "Log in required"
 * screen any more: the page steps back to where they came from (home, for a
 * link opened cold) and the sign-in sheet opens over it. Once they are signed
 * in, this page opens (lib/after-sign-in).
 *
 * Signed-out taps on links to these pages never get here: AfterSignIn opens
 * the sheet in place. This catches everything else: a typed or shared URL, a
 * programmatic navigate(), a sign-out while the page is open.
 *
 * @module components/app/AuthGate
 */

import { useContext, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useLoginSheet } from '@/contexts/AuthContext';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { requestSheetAfterLeave, signedOutRecently } from '@/lib/after-sign-in';

// `description` is kept so call sites need not change; nothing reads it now.
export function AuthGate(_props: { description?: string } = {}) {
  const { isLoading, isAuthenticated } = useAuth();
  const { isLoginModalOpen } = useLoginSheet();
  const active = useContext(CachedPageActiveContext);
  const navigate = useNavigate();
  const location = useLocation();
  const handledRef = useRef(false);
  const sawSheetRef = useRef(false);

  useEffect(() => {
    if (!active) {
      // A cached page waiting in the background does nothing until it is shown.
      handledRef.current = false;
      sawSheetRef.current = false;
      return;
    }
    if (isLoading || isAuthenticated || handledRef.current) return;
    if (isLoginModalOpen) {
      // A sheet that was already up (session expiry, add a profile) is left to
      // finish. If it closes without an account, this page steps aside below.
      sawSheetRef.current = true;
      return;
    }
    handledRef.current = true;
    if (!sawSheetRef.current && !signedOutRecently()) {
      // AfterSignIn opens the sheet once the step back below has landed.
      requestSheetAfterLeave(location.pathname + location.search + location.hash);
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  }, [active, isLoading, isAuthenticated, isLoginModalOpen, navigate, location.pathname, location.search, location.hash]);

  // Blank while it steps aside; the skeleton only while auth is still loading.
  return (
    <div
      data-auth-gate
      aria-busy={isLoading || undefined}
      className="flex flex-col items-center justify-center min-h-[calc(100svh_-_64px_-_var(--app-top-bar))] lg:min-h-screen p-8"
    >
      {isLoading && (
        <>
          <div className="w-20 h-20 mb-6 rounded-full theme-skeleton animate-pulse" />
          <div className="h-6 w-40 theme-skeleton rounded animate-pulse mb-6" />
          <div className="h-10 w-24 theme-skeleton rounded-xl animate-pulse" />
        </>
      )}
    </div>
  );
}

export default AuthGate;
