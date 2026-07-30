import { useCallback, useEffect, useState } from 'react';
import { isWalletUnlocked, WALLET_LOCK_CHANGED_EVENT } from '@/lib/smart-wallet';
import { isSmartWalletSession } from '@/lib/connection-source';

/**
 * True when this session signs with the built-in wallet AND its key is not
 * currently in memory — i.e. the next action that needs a signature will have
 * to ask for the password.
 *
 * External-wallet sessions are never "locked" in this sense: their wallet does
 * its own prompting, so the hook returns false for them and no unlock
 * affordance is offered.
 *
 * The underlying state is a module variable in @/lib/smart-wallet, so this
 * listens for the lock-changed event rather than polling. It also re-reads when
 * the tab comes back to the foreground, because isWalletUnlocked() auto-locks
 * on read once the user's configured interval has elapsed — leaving a phone
 * that has been in a pocket for an hour showing a stale "unlocked".
 */
export function useWalletLocked(): boolean {
  const read = useCallback(() => isSmartWalletSession() && !isWalletUnlocked(), []);
  const [locked, setLocked] = useState(read);

  useEffect(() => {
    const sync = () => setLocked(read());
    sync();

    window.addEventListener(WALLET_LOCK_CHANGED_EVENT, sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [read]);

  return locked;
}
