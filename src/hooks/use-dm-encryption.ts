/**
 * Brings the signed-in user's DM encryption identity online.
 *
 * First visit on a device: one wallet signature derives the keypair, which is
 * then stored locally and published. Every later visit loads it silently. A
 * locked embedded wallet is reported as `locked` rather than an error.
 *
 * Opening a chat is the one moment this may raise a wallet prompt. Everything
 * else — regaining focus, the vault opening for some other action — only
 * retries when a signature can be produced without asking, because
 * MessagesPage never unmounts (PersistentPageCache CSS-hides it) and a thread
 * left open would otherwise keep raising the unlock sheet on top of whatever
 * page the user is actually on. That is what it did: a signature request
 * arriving minutes later, over the feed, for something the user had walked
 * away from.
 *
 * The status is not decoration. Without an identity the chat degrades in
 * silence — everything typed goes out in the clear and everything the peer
 * encrypted renders as "can't be opened on this device" — so whatever renders
 * this hook has to show `locked`/`error` and offer `retry`.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { loadIdentity, setupIdentity, syncPublishedKey } from '@/lib/dm-e2ee/keys';
import { signEncryptionMessage, WalletLockedError } from '@/lib/dm-e2ee/signer';
import { isWalletUnlocked, WALLET_LOCK_CHANGED_EVENT } from '@/lib/smart-wallet';

export type DmEncryptionStatus = 'idle' | 'pending' | 'ready' | 'locked' | 'error';

export function useDmEncryption(enabled = true) {
  const { isAuthenticated, walletAddress, connectionSource } = useAuth();
  const isActivePage = useContext(CachedPageActiveContext);
  const [status, setStatus] = useState<DmEncryptionStatus>('idle');
  const attemptedFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  /**
   * @param mayPrompt whether this attempt is allowed to raise the wallet
   *                  unlock sheet. True for opening the chat and for the
   *                  banner's own "turn on"; false for every background retry.
   */
  const run = useCallback(async (mayPrompt: boolean) => {
    if (!enabled || !isAuthenticated || !walletAddress || inFlight.current) return;
    inFlight.current = true;
    try {
      if (loadIdentity(walletAddress)) {
        setStatus('ready');
        // Best effort: make sure peers see the key this device can open.
        syncPublishedKey().catch(() => {});
        return;
      }
      // Deriving the identity costs a signature. Outside a deliberate moment,
      // only take it when the wallet can sign right now — otherwise the signer
      // raises the unlock sheet and the user is asked out of nowhere.
      if (!mayPrompt && !isWalletUnlocked()) {
        setStatus((prev) => (prev === 'idle' || prev === 'pending' ? 'locked' : prev));
        return;
      }
      setStatus('pending');
      await setupIdentity(walletAddress, (message) =>
        signEncryptionMessage(message, walletAddress, connectionSource),
      );
      setStatus('ready');
    } catch (err) {
      const locked = err instanceof WalletLockedError;
      setStatus(locked ? 'locked' : 'error');
      // A locked vault is an expected pause, already represented by the unlock
      // sheet. Keep genuine encryption failures visible without flooding the
      // console/backend with scary-looking errors during a normal unlock.
      if (!locked) console.warn('[dm-e2ee] identity setup failed:', err);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, isAuthenticated, walletAddress, connectionSource]);

  const retry = useCallback(() => run(true), [run]);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !walletAddress) {
      setStatus('idle');
      attemptedFor.current = null;
      return;
    }
    if (attemptedFor.current === walletAddress) return;
    attemptedFor.current = walletAddress;
    void run(true);
  }, [enabled, isAuthenticated, walletAddress, run]);

  useEffect(() => {
    if (status !== 'locked' && status !== 'error') return;
    // A hidden cached page has no business reacting to anything: the user is
    // somewhere else entirely and did not open a chat.
    if (!isActivePage) return;
    const onChange = () => { void run(false); };
    window.addEventListener('focus', onChange);
    // The vault opening is the event this is actually waiting for; focus is
    // only the backstop for an unlock that happened in another surface. Both
    // fire on the way down too, hence the unlocked check inside run().
    window.addEventListener(WALLET_LOCK_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener('focus', onChange);
      window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, onChange);
    };
  }, [status, run, isActivePage]);

  return { status, retry };
}
