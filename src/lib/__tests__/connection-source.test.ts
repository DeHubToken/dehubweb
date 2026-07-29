import { describe, it, expect, beforeEach } from 'vitest';
import {
  readConnectionSource,
  writeConnectionSource,
  clearConnectionSource,
  restoreConnectionSource,
  isSmartWalletSession,
  healConnectionSource,
} from '@/lib/connection-source';

const TAG = 'dehub_connection_source';
const UID = 'dehub_supabase_uid';

beforeEach(() => {
  localStorage.clear();
});

describe('readConnectionSource', () => {
  it('reads the two known sources', () => {
    localStorage.setItem(TAG, 'web3auth');
    expect(readConnectionSource()).toBe('web3auth');
    localStorage.setItem(TAG, 'wagmi');
    expect(readConnectionSource()).toBe('wagmi');
  });

  it('treats anything else as untagged', () => {
    expect(readConnectionSource()).toBeNull();
    localStorage.setItem(TAG, 'metamask');
    expect(readConnectionSource()).toBeNull();
  });
});

describe('isSmartWalletSession', () => {
  it('is true for a tagged smart-wallet session', () => {
    localStorage.setItem(TAG, 'web3auth');
    expect(isSmartWalletSession()).toBe(true);
  });

  it('is false for a tagged external wallet, even with a stale identity marker', () => {
    // Someone who used email login before switching to MetaMask. An external
    // wallet that has gone away is a dropped connection, not a locked key, and
    // prompting for a wallet password they never set would be worse than the
    // error it replaced.
    localStorage.setItem(TAG, 'wagmi');
    localStorage.setItem(UID, 'uid-from-an-older-login');
    expect(isSmartWalletSession()).toBe(false);
  });

  it('is true when the tag was lost but the session is still a smart-wallet one', () => {
    // The bug this module exists for: a failed connect attempt deleted the tag
    // while the DeHub session stayed alive.
    localStorage.setItem(UID, 'uid');
    expect(isSmartWalletSession()).toBe(true);
  });

  it('is false when there is nothing to go on', () => {
    expect(isSmartWalletSession()).toBe(false);
  });
});

describe('restoreConnectionSource', () => {
  it('puts back the previous tag after a failed connect attempt', () => {
    localStorage.setItem(TAG, 'web3auth');
    const previous = readConnectionSource();

    writeConnectionSource('wagmi'); // optimistic tag, before the connector agrees
    restoreConnectionSource(previous); // connector rejected

    expect(readConnectionSource()).toBe('web3auth');
  });

  it('clears the tag when there was nothing there before', () => {
    const previous = readConnectionSource();
    writeConnectionSource('wagmi');
    restoreConnectionSource(previous);

    expect(readConnectionSource()).toBeNull();
  });
});

describe('healConnectionSource', () => {
  it('repairs a stranded smart-wallet session', () => {
    localStorage.setItem(UID, 'uid');

    expect(healConnectionSource()).toBe('web3auth');
    expect(localStorage.getItem(TAG)).toBe('web3auth');
  });

  it('leaves an existing tag alone', () => {
    localStorage.setItem(TAG, 'wagmi');
    localStorage.setItem(UID, 'uid');

    expect(healConnectionSource()).toBe('wagmi');
    expect(localStorage.getItem(TAG)).toBe('wagmi');
  });

  it('does not guess when there is no marker either way', () => {
    // An untagged external wallet is indistinguishable from no session at all,
    // and guessing 'web3auth' would send someone who never set a wallet
    // password to a dialog demanding one.
    expect(healConnectionSource()).toBeNull();
    expect(localStorage.getItem(TAG)).toBeNull();
  });
});

describe('clearConnectionSource', () => {
  it('removes the tag', () => {
    writeConnectionSource('web3auth');
    clearConnectionSource();
    expect(readConnectionSource()).toBeNull();
  });
});
