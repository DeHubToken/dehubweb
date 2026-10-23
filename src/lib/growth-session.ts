/**
 * What happens when the session changes, for growth attribution. App loads
 * this lazily, so none of it sits on the boot path.
 *
 * Signed in (after any username step): write where this account came from,
 * once; look up the viewer's affiliate code so their first share link already
 * credits them; identify them in PostHog, with `signup` for a new account.
 * Signed out: plain share links, and PostHog forgets the wallet.
 */

import { identifyAnalytics, initAnalytics, trackSignup } from '@/lib/analytics-client';
import { setViewerAffiliateCode } from '@/lib/share-url';

export function syncGrowthSession(wallet: string | null): void {
  initAnalytics();
  identifyAnalytics(wallet);
  if (!wallet) {
    setViewerAffiliateCode(null);
    return;
  }

  let isNewAccount = false;
  try { isNewAccount = sessionStorage.getItem('dehub_is_new_account') === 'true'; } catch { /* storage blocked */ }
  if (isNewAccount) trackSignup(wallet);
  import('@/lib/signup-attribution').then((m) => m.persistSignupAttribution(wallet, isNewAccount)).catch(() => undefined);
  import('@/lib/useAffiliateShareUrl').then((m) => m.loadViewerAffiliateCode(wallet)).catch(() => undefined);
}
