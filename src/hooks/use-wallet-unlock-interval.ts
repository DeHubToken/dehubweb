/**
 * Wallet-unlock interval preference.
 *
 * Controls how long the DECRYPTED wallet key stays usable for wallet actions
 * (tipping, transfers, etc.) before an unlock is required again. Enforced in
 * lib/smart-wallet.ts's isWalletUnlocked().
 *
 * Scope, precisely: this only suppresses RE-prompts inside a page session that
 * already unlocked once. It cannot make signing in free of an unlock — the
 * DeHub session token is minted by a wallet signature, so establishing a
 * session needs the key by definition — and because the decrypted key is
 * memory-only (see lib/smart-wallet.ts), a page reload always starts locked
 * regardless of this setting. Biometric unlock is what makes those unavoidable
 * prompts cheap; this setting decides how often they happen.
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
