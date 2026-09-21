/**
 * What the person said they came to do BEFORE signing in, chosen on the login
 * sheet's main step: bring over an old (Web3Auth-era) DeHub account, or import
 * an external wallet. The wallet step can only run once a Supabase identity
 * exists, and reaching one may involve a full-page OAuth redirect, so the
 * choice lives in sessionStorage rather than component state.
 *
 * Absent an intent, the wallet step decides for itself: it migrates when the
 * backend recognises the login as an old account, and otherwise sets up a
 * new one without offering a choice.
 */
export type WalletSetupIntent = 'migrate' | 'import';

const KEY = 'dehub_wallet_setup_intent';

export function getWalletSetupIntent(): WalletSetupIntent | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value === 'migrate' || value === 'import' ? value : null;
  } catch {
    return null;
  }
}

export function setWalletSetupIntent(intent: WalletSetupIntent | null): void {
  try {
    if (intent) sessionStorage.setItem(KEY, intent);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
