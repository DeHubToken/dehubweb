import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The real EthereumPrivateKeyProvider drags in @web3auth/auth's mimcsponge,
// which throws "Uint8Array expected" under jsdom before any of our code runs.
// Only the key-in-memory bookkeeping matters here, not what the provider is.
vi.mock('@web3auth/ethereum-provider', () => ({
  EthereumPrivateKeyProvider: class {
    async setupProvider() { /* no-op */ }
    request() { return Promise.resolve([]); }
  },
}));

import {
  activateWalletKey,
  lockWallet,
  isWalletUnlocked,
  WALLET_LOCK_CHANGED_EVENT,
} from '@/lib/smart-wallet';
import { isSmartWalletSession } from '@/lib/connection-source';
import { WALLET_UNLOCK_INTERVAL_KEY } from '@/hooks/use-wallet-unlock-interval';

/**
 * Covers the contract useWalletLocked is built on: the predicate it evaluates,
 * and the event that tells it to re-evaluate. The hook's own React binding is
 * not exercised here because @testing-library/dom is missing from the install,
 * which also breaks the repo's existing renderHook-based suites.
 */

// A throwaway key — buildProviderFromPrivKey only needs something well-formed.
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

/** What the hook computes on every sync. */
const readLocked = () => isSmartWalletSession() && !isWalletUnlocked();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  lockWallet();
});

afterEach(() => {
  lockWallet();
});

describe('locked predicate', () => {
  it('is false for an external-wallet session, however locked the built-in wallet is', () => {
    // A MetaMask user has no wallet password to be asked for, so offering them
    // an unlock affordance would be offering a dialog they cannot complete.
    localStorage.setItem('dehub_connection_source', 'wagmi');
    expect(readLocked()).toBe(false);
  });

  it('is false when nobody is signed in', () => {
    expect(readLocked()).toBe(false);
  });

  it('is true for a built-in-wallet session with no key in memory', () => {
    // The state after every reload, and after every auto-lock.
    localStorage.setItem('dehub_connection_source', 'web3auth');
    expect(readLocked()).toBe(true);
  });

  it('is true when the tag was lost but the session is still a built-in one', () => {
    localStorage.setItem('dehub_supabase_uid', 'uid');
    expect(readLocked()).toBe(true);
  });

  it('is false once the key is in memory', async () => {
    localStorage.setItem('dehub_connection_source', 'web3auth');
    await activateWalletKey(KEY);
    expect(readLocked()).toBe(false);
  });
});

describe('lock-change event', () => {
  it('fires when the key is activated, so a mounted affordance can hide itself', async () => {
    const seen = vi.fn();
    window.addEventListener(WALLET_LOCK_CHANGED_EVENT, seen);

    await activateWalletKey(KEY);

    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, seen);
  });

  it('fires when the wallet locks, so the affordance can come back', async () => {
    await activateWalletKey(KEY);

    const seen = vi.fn();
    window.addEventListener(WALLET_LOCK_CHANGED_EVENT, seen);
    lockWallet();

    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, seen);
  });

  it('fires on the auto-lock that isWalletUnlocked performs on read', async () => {
    // Without this the menu would keep saying "unlocked" after the user's
    // configured interval had silently expired — the phone-in-a-pocket case.
    localStorage.setItem('dehub_connection_source', 'web3auth');
    localStorage.setItem(WALLET_UNLOCK_INTERVAL_KEY, '15m');
    await activateWalletKey(KEY);

    const seen = vi.fn();
    window.addEventListener(WALLET_LOCK_CHANGED_EVENT, seen);
    sessionStorage.setItem('dehub_wallet_unlocked_at', String(Date.now() - 20 * 60 * 1000));

    expect(isWalletUnlocked()).toBe(false);
    expect(seen).toHaveBeenCalled();
    window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, seen);
  });
});
