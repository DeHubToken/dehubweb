/**
 * Brings the signed-in user's DM encryption identity online.
 *
 * First visit on a device: one wallet signature derives the keypair, which is
 * then stored locally and published. Every later visit loads it silently. A
 * locked embedded wallet is reported as `locked` rather than an error, and
 * the hook retries when the tab regains focus (the unlock sheet lives in
 * another surface, so focus is the cheapest "something changed" signal) and,
 * more precisely, the moment the vault actually opens.
 *
 * The status is not decoration. Without an identity the chat degrades in
 * silence — everything typed goes out in the clear and everything the peer
 * encrypted renders as "can't be opened on this device" — so whatever renders
 * this hook has to show `locked`/`error` and offer `retry`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadIdentity, setupIdentity, syncPublishedKey } from '@/lib/dm-e2ee/keys';
import { signEncryptionMessage, WalletLockedError } from '@/lib/dm-e2ee/signer';
import { WALLET_LOCK_CHANGED_EVENT } from '@/lib/smart-wallet';

export type DmEncryptionStatus = 'idle' | 'pending' | 'ready' | 'locked' | 'error';

export function useDmEncryption(enabled = true) {
  const { isAuthenticated, walletAddress, connectionSource } = useAuth();
  const [status, setStatus] = useState<DmEncryptionStatus>('idle');
  const attemptedFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async () => {
    if (!enabled || !isAuthenticated || !walletAddress || inFlight.current) return;
    inFlight.current = true;
    try {
      if (loadIdentity(walletAddress)) {
        setStatus('ready');
        // Best effort: make sure peers see the key this device can open.
        syncPublishedKey().catch(() => {});
        return;
      }
      setStatus('pending');
      await setupIdentity(walletAddress, (message) =>
        signEncryptionMessage(message, walletAddress, connectionSource),
      );
      setStatus('ready');
    } catch (err) {
      setStatus(err instanceof WalletLockedError ? 'locked' : 'error');
      console.warn('[dm-e2ee] identity setup failed:', err);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, isAuthenticated, walletAddress, connectionSource]);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !walletAddress) {
      setStatus('idle');
      attemptedFor.current = null;
      return;
    }
    if (attemptedFor.current === walletAddress) return;
    attemptedFor.current = walletAddress;
    void run();
  }, [enabled, isAuthenticated, walletAddress, run]);

  useEffect(() => {
    if (status !== 'locked' && status !== 'error') return;
    const onChange = () => { void run(); };
    window.addEventListener('focus', onChange);
    // The vault opening is the event this is actually waiting for; focus is
    // only the backstop for an unlock that happened in another surface.
    window.addEventListener(WALLET_LOCK_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener('focus', onChange);
      window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, onChange);
    };
  }, [status, run]);

  return { status, retry: run };
}
