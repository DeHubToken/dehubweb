/**
 * Fire-and-forget claim of the free AI credit allowance.
 * ======================================================
 * The starter grant existed server-side with no caller — useClaimFreeCredits
 * sat in use-ai-credits.ts and nothing ever invoked it, so "free credit" was
 * a feature only in the ledger schema. This gives it a caller and pairs it
 * with the daily accrual that ships alongside: the app shell fires it
 * whenever a wallet appears, with no react-query state, because the server
 * is idempotent per UTC day and the worst a duplicate call does is read its
 * own ledger row back.
 */

import { toast } from 'sonner';
import { dehubAuthHeaders, invokeAi } from '@/lib/ai-invoke';
import { isTokenExpired } from '@/lib/api/dehub';

// One attempt per wallet per page load. The sign-in effect can fire more than
// once (wallet identity re-derives on auth refreshes), and a wallet switch in
// the same tab should still get its own claim. Cleared on failure so the
// token-refresh retry below can pass.
let claimedForWallet: string | null = null;

export async function claimDailyAiCredit(onGranted?: (granted: number) => void): Promise<void> {
  const wallet = localStorage.getItem('dehub_wallet')?.toLowerCase() ?? null;
  if (!wallet || claimedForWallet === wallet) return;
  // Signed out, or the token hasn't landed yet: the call would only 401.
  // Stay silent and let the next sign-in try again.
  if (Object.keys(dehubAuthHeaders()).length === 0) return;

  // A restored session usually comes back with an expired token — exactly
  // the returning visitor the daily allowance is for. Firing now would burn
  // the attempt on a guaranteed 401 while the proactive refresh is still in
  // flight, so wait for it instead and claim once, when it lands.
  if (isTokenExpired()) {
    window.addEventListener(
      'dehub:token-refreshed',
      () => { void claimDailyAiCredit(onGranted); },
      { once: true },
    );
    return;
  }

  claimedForWallet = wallet;
  try {
    const { data, error } = await invokeAi<{ granted?: number }>('ai-credits', {
      body: { action: 'claim-daily' },
    });
    if (error) {
      claimedForWallet = null;
      return;
    }
    const granted = Number(data?.granted ?? 0);
    if (granted > 0) {
      toast.success(granted.toLocaleString() + ' DHB free AI credit added');
      onGranted?.(granted);
    }
  } catch {
    // Token races on sign-out and transient network faults are all expected
    // here; the claim accrues, so a missed day is collected on the next one.
    claimedForWallet = null;
  }
}
