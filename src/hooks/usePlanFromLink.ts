import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Google Play external transaction token for the current checkout.
 *
 * The Android app can only send a US user here through Google Play's external
 * content links flow, which issues one token per link-out and expects every
 * resulting purchase to be reported back to Google against it. The app appends
 * it as `?gpt=`; it is kept for the tab's lifetime so a sign-in detour does not
 * lose it, and create-checkout carries it onto the Stripe subscription.
 */
const PLAY_TOKEN_KEY = 'dehub:play-external-token';

export function getPlayExternalToken(): string | undefined {
  try {
    return sessionStorage.getItem(PLAY_TOKEN_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Opens checkout for the plan named in `?plan=` — the link the mobile app
 * sends buyers to. Waits for a connected wallet (checkout needs one), asking
 * for sign-in once, then hands the price id over exactly as a click would.
 * Both parameters are stripped from the address bar so a reload does not
 * reopen checkout.
 */
export function usePlanFromLink({
  allowed,
  walletAddress,
  openLoginModal,
  onPlan,
}: {
  allowed: readonly string[];
  walletAddress?: string | null;
  openLoginModal?: () => void;
  onPlan: (priceId: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);
  const askedLogin = useRef(false);

  useEffect(() => {
    const plan = searchParams.get('plan');
    const token = searchParams.get('gpt');
    if (!plan && !token) return;
    if (token && /^[A-Za-z0-9._~+/=-]{1,2048}$/.test(token)) {
      try {
        sessionStorage.setItem(PLAY_TOKEN_KEY, token);
      } catch {
        /* storage blocked: checkout still works, the report just lacks a token */
      }
    }
    if (plan && allowed.includes(plan)) setPending(plan);
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    next.delete('gpt');
    setSearchParams(next, { replace: true });
    // Read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pending) return;
    if (walletAddress) {
      onPlan(pending);
      setPending(null);
    } else if (!askedLogin.current) {
      askedLogin.current = true;
      try {
        openLoginModal?.();
      } catch {
        /* login modal unavailable on this surface */
      }
    }
  }, [pending, walletAddress, openLoginModal, onPlan]);
}
