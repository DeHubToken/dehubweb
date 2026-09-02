/**
 * Brings the signed-in user's DM encryption identity online.
 *
 * First visit on a device: one wallet signature derives the keypair, which is
 * then stored locally and published. Every later visit loads it silently. A
 * locked embedded wallet is reported as `locked` rather than an error, and
 * the hook retries when the tab regains focus (the unlock sheet lives in
 * another surface, so focus is the cheapest "something changed" signal).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadIdentity, setupIdentity, syncPublishedKey } from '@/lib/dm-e2ee/keys';
import { signEncryptionMessage, WalletLockedError } from '@/lib/dm-e2ee/signer';

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
    if (status !== 'locked') return;
    const onFocus = () => { void run(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, run]);

  return { status, retry: run };
}
