import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const waiters = new Set<(completed: boolean) => void>();
let promptOpen = false;

export function setWalletUnlockPrompt(open: boolean): void {
  promptOpen = open;
  listeners.forEach(listener => listener());
}

export function finishWalletUnlock(completed: boolean): void {
  for (const finish of [...waiters]) finish(completed);
  setWalletUnlockPrompt(false);
}

export function useWalletUnlockPrompt(): boolean {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => promptOpen,
    () => false,
  );
}

export class WalletActionCancelledError extends Error {
  readonly code = 'WALLET_ACTION_CANCELLED';
  constructor() { super('Wallet action cancelled.'); }
}

/** Wait before signing, never replay an action or a submitted transaction. */
export function waitForWalletUnlock(): Promise<void> {
  const address = localStorage.getItem('dehub_wallet')?.toLowerCase();
  const uid = localStorage.getItem('dehub_supabase_uid');
  const route = window.location.pathname + window.location.search;
  return new Promise((resolve, reject) => {
    const sameContext = () => address === localStorage.getItem('dehub_wallet')?.toLowerCase()
      && uid === localStorage.getItem('dehub_supabase_uid')
      && route === window.location.pathname + window.location.search;
    const finish = (completed: boolean) => {
      waiters.delete(finish);
      clearInterval(contextCheck);
      clearTimeout(timeout);
      if (completed && sameContext()) resolve();
      else reject(new WalletActionCancelledError());
    };
    const contextCheck = setInterval(() => { if (!sameContext()) finish(false); }, 250);
    const timeout = setTimeout(() => finish(false), 5 * 60_000);
    waiters.add(finish);
    window.dispatchEvent(new Event('dehub:wallet-unlock-required'));
  });
}
