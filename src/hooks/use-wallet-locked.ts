import { useCallback, useEffect, useState } from 'react';
import { isUnlockAvailable, WALLET_LOCK_CHANGED_EVENT } from '@/lib/smart-wallet';
import { isSmartWalletSession } from '@/lib/connection-source';

/**
 * True when this session signs with the built-in wallet AND the next action
 * that needs a signature will have to ask for the password.
 *
 * Deliberately isUnlockAvailable, not isWalletUnlocked: right after a reload
 * the key isn't in memory yet but the vault can supply it without asking the
 * user anything. Using the strict check here would paint "Unlock to post" on
 * every composer for a wallet that is not, in any sense the user cares about,
 * locked.
 *
 * External-wallet sessions are never "locked" in this sense: their wallet does
 * its own prompting, so the hook returns false for them and no unlock
 * affordance is offered.
 *
 * The underlying state is a module variable in @/lib/smart-wallet, so this
 * listens for the lock-changed event rather than polling. It also re-reads when
 * the tab comes back to the foreground, because isUnlockAvailable() auto-locks
 * on read once the user's configured interval has elapsed — leaving a phone
 * that has been in a pocket for an hour showing a stale "unlocked".
 */
export function useWalletLocked(): boolean {
  const read = useCallback(() => isSmartWalletSession() && !isUnlockAvailable(), []);
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
