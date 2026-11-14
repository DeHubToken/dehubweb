/**
 * AfterSignIn
 * ===========
 * Two jobs, both about signed-out taps (see lib/after-sign-in):
 *
 * 1. A signed-out tap on a link to an account-only page (Notifications,
 *    Messages, Settings, Wallet...) stays on the page they are on and opens
 *    the sign-in sheet over it, instead of moving to a "Log in required"
 *    screen. The page opens once they are signed in.
 * 2. When the login flow goes quiet with a new account signed in, whatever
 *    they tapped carries on. When it ends without one, it is dropped.
 *
 * Renders nothing. Lives inside the router and AuthProvider.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useLoginSheet } from '@/contexts/AuthContext';
import { useTwoFactorPrompt } from '@/lib/two-factor-login';
import {
  clearAfterSignIn,
  hasAfterSignIn,
  isAccountOnlyPath,
  recordTap,
  replayTap,
  takeAfterSignIn,
  takeSheetAfterLeave,
} from '@/lib/after-sign-in';
import { SIGN_IN_WALL_EVENT } from '@/lib/sign-in-wall';

/** Long enough for the page under the sheet to re-render as signed in. */
const SETTLE_MS = 450;

export function AfterSignIn() {
  const {
    isAuthenticated,
    isLoading,
    walletAddress,
    isConnecting,
    isProcessingRedirect,
    requiresUsername,
    openLoginModal,
  } = useAuth();
  const { isLoginModalOpen } = useLoginSheet();
  const twoFactor = useTwoFactorPrompt();
  const navigate = useNavigate();
  const location = useLocation();

  const latest = useRef({ isAuthenticated, isLoading, openLoginModal, navigate, pathname: location.pathname });
  latest.current = { isAuthenticated, isLoading, openLoginModal, navigate, pathname: location.pathname };

  // 0. Signed-out reading reached the end of what the API shows without an
  //    account (lib/sign-in-wall): ask them to sign in to keep scrolling.
  useEffect(() => {
    const onWall = () => {
      const { isAuthenticated: authed, isLoading: loading, openLoginModal: open } = latest.current;
      if (authed || loading) return;
      open();
    };
    window.addEventListener(SIGN_IN_WALL_EVENT, onWall);
    return () => window.removeEventListener(SIGN_IN_WALL_EVENT, onWall);
  }, []);

  // 1. Signed-out taps: remember the button, and keep account-only links in place.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      recordTap(e.target);
      const { isAuthenticated: authed, isLoading: loading } = latest.current;
      if (authed || loading || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || !isAccountOnlyPath(url.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current.openLoginModal({ path: url.pathname + url.search + url.hash });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // An account-only page stepped back off itself: the sheet opens over the
  // page it landed on, and that page opens after sign-in.
  useEffect(() => {
    if (isAuthenticated || isLoading) return;
    const path = takeSheetAfterLeave(location.pathname);
    if (path) openLoginModal({ path });
  }, [location.key, location.pathname, isAuthenticated, isLoading, openLoginModal]);

  // 2. Carry on once the login flow has finished. The account can land a beat
  // after the sheet closes (each login path closes it at the end of its own
  // async work), so the end of the flow waits briefly for it before giving up.
  const flowActive = isLoginModalOpen || isConnecting || isProcessingRedirect || requiresUsername || !!twoFactor;
  const wasActive = useRef(flowActive);
  const authRef = useRef({ isAuthenticated, walletAddress, flowActive });
  authRef.current = { isAuthenticated, walletAddress, flowActive };
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const ended = wasActive.current && !flowActive;
    wasActive.current = flowActive;
    if (flowActive) {
      window.clearTimeout(timerRef.current);
      return;
    }
    if (!ended || !hasAfterSignIn()) return;
    const startedAt = Date.now();
    const check = () => {
      const now = authRef.current;
      if (now.flowActive) return; // a new attempt took over; its own end decides
      if (now.isAuthenticated && now.walletAddress) {
        const action = takeAfterSignIn(now.walletAddress);
        if (!action) return;
        timerRef.current = window.setTimeout(() => {
          if (action.run) {
            action.run();
          } else if (action.path) {
            const here = window.location.pathname + window.location.search + window.location.hash;
            if (here !== action.path) latest.current.navigate(action.path);
          } else if (action.tap) {
            replayTap(action.tap);
          }
        }, SETTLE_MS);
        return;
      }
      if (Date.now() - startedAt > 3000) {
        clearAfterSignIn();
        return;
      }
      timerRef.current = window.setTimeout(check, 150);
    };
    check();
  }, [flowActive]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return null;
}

export default AfterSignIn;
