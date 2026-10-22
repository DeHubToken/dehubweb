// "Secure your wallet" at the first wallet action, the counterpart of
// wallet-unlock-flow.ts for a wallet sign-up made silently.
//
// ensureWalletUnlocked calls waitForWalletSecure when this browser still holds
// the unsecured words of the signed-in account (wallet-core/device-seed).
// AuthProvider answers the event by opening the login sheet on its
// 'wallet-secure' step, and that step calls finishWalletSecure once a password
// or biometrics wraps the wallet. Closing the sheet cancels the action, the
// same as closing the unlock sheet does, and the offer comes back next time.
import { WalletActionCancelledError } from '@/lib/wallet-unlock-flow';
import { readDeviceSeed } from '@/lib/wallet-core/device-seed';

export const WALLET_SECURE_REQUIRED_EVENT = 'dehub:wallet-secure-required';

const waiters = new Set<(completed: boolean) => void>();

export function finishWalletSecure(completed: boolean): void {
  for (const finish of [...waiters]) finish(completed);
}

export function isWalletSecurePending(): boolean {
  return waiters.size > 0;
}

function waitForWalletSecure(): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (completed: boolean) => {
      waiters.delete(finish);
      clearTimeout(timeout);
      if (completed) resolve();
      else reject(new WalletActionCancelledError());
    };
    const timeout = setTimeout(() => finish(false), 5 * 60_000);
    waiters.add(finish);
    // Calls that arrive together share the one sheet.
    if (waiters.size === 1) window.dispatchEvent(new Event(WALLET_SECURE_REQUIRED_EVENT));
  });
}

/** Resolves at once unless this browser holds the signed-in account's unsecured wallet. */
export async function offerWalletSecure(): Promise<void> {
  const uid = localStorage.getItem('dehub_supabase_uid');
  if (!uid) return;
  if (!(await readDeviceSeed(uid))) return;
  await waitForWalletSecure();
}
