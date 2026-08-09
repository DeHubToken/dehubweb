/**
 * Wallet-unlock interval preference.
 *
 * Controls how long the DECRYPTED wallet key stays usable for wallet actions
 * (tipping, transfers, etc.) before an unlock is required again. Enforced in
 * lib/smart-wallet.ts's isWalletUnlocked().
 *
 * Scope, precisely: the window runs from the last time the user actually
 * entered their password (or used biometrics) and now spans page loads, because
 * the key is kept in the IndexedDB vault rather than in page memory. "Never"
 * means until logout.
 *
 * It was previously per-page-session, which made every value here a promise the
 * app didn't keep: a refresh — or the hard navigation the username modal used
 * to do right after signup — relocked the wallet no matter what was chosen, and
 * a new account got asked for its password again minutes after setting it.
 */
import { useState, useCallback } from 'react';

export const WALLET_UNLOCK_INTERVAL_KEY = 'dehub_wallet_unlock_interval';

export type WalletUnlockIntervalOption = 'never' | '15m' | '1h' | '6h' | '24h';

export const DEFAULT_WALLET_UNLOCK_INTERVAL: WalletUnlockIntervalOption = '24h';

// null = "never" — no auto-lock timer, matches the pre-existing behavior
// (unlocked for the tab's lifetime, cleared only on tab close/logout).
const INTERVAL_MS: Record<WalletUnlockIntervalOption, number | null> = {
  never: null,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

function isOption(v: string | null): v is WalletUnlockIntervalOption {
  return !!v && v in INTERVAL_MS;
}

function readOption(): WalletUnlockIntervalOption {
  try {
    const stored = localStorage.getItem(WALLET_UNLOCK_INTERVAL_KEY);
    return isOption(stored) ? stored : DEFAULT_WALLET_UNLOCK_INTERVAL;
  } catch {
    return DEFAULT_WALLET_UNLOCK_INTERVAL;
  }
}

/** Plain (non-hook) reader for use outside React — smart-wallet.ts's isWalletUnlocked(). */
export function getWalletUnlockIntervalMs(): number | null {
  return INTERVAL_MS[readOption()];
}

export function useWalletUnlockInterval() {
  const [option, setOptionState] = useState<WalletUnlockIntervalOption>(readOption);

  const setOption = useCallback((next: WalletUnlockIntervalOption) => {
    try { localStorage.setItem(WALLET_UNLOCK_INTERVAL_KEY, next); } catch { /* ignore */ }
    setOptionState(next);
  }, []);

  return { option, setOption };
}
