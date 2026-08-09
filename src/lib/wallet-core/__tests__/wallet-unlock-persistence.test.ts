import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ADDRESS = '0x8f083b31E255709268A71CF6D620EC7BB6556C5E';

// As in use-wallet-locked.test.ts: the real provider drags in mimcsponge, which
// throws under jsdom. This one also answers eth_accounts, which the vault write
// needs to tag the record with an address.
vi.mock('@web3auth/ethereum-provider', () => ({
  EthereumPrivateKeyProvider: class {
    async setupProvider() { /* no-op */ }
    request({ method }: { method: string }) {
      return Promise.resolve(method === 'eth_accounts' ? [ADDRESS] : []);
    }
  },
}));

// jsdom has no IndexedDB, so the vault is exercised through its interface
// rather than a real store — what matters here is smart-wallet's use of it.
const vault = vi.hoisted(() => ({
  saveVaultSession: vi.fn(async (_privKeyHex: string, _address: string, _unlockedAt: number) => true),
  readVaultSession: vi.fn(
    async (_expectedAddress?: string) =>
      null as null | { privKeyHex: string; address: string; unlockedAt: number },
  ),
  clearVaultSession: vi.fn(async () => {}),
}));
vi.mock('@/lib/wallet-core/key-vault', () => vault);

import {
  activateWalletKey,
  restoreWalletSession,
  lockWallet,
  isWalletUnlocked,
} from '@/lib/smart-wallet';
import { WALLET_UNLOCK_INTERVAL_KEY } from '@/hooks/use-wallet-unlock-interval';

const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const KEY_NO_PREFIX = KEY.slice(2);
const UNLOCKED_AT = 'dehub_wallet_unlocked_at';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  lockWallet();
  vault.saveVaultSession.mockClear();
  vault.readVaultSession.mockClear();
  vault.readVaultSession.mockResolvedValue(null);
  vault.clearVaultSession.mockClear();
});

afterEach(() => { lockWallet(); });

describe('unlocking hands the key to the vault', () => {
  it('persists the key, its address, and when the unlock happened', async () => {
    await activateWalletKey(KEY);

    expect(vault.saveVaultSession).toHaveBeenCalledTimes(1);
    const [privKeyHex, address, unlockedAt] = vault.saveVaultSession.mock.calls[0];
    expect(privKeyHex).toBe(KEY_NO_PREFIX);
    expect(address).toBe(ADDRESS);
    expect(unlockedAt).toBe(Number(localStorage.getItem(UNLOCKED_AT)));
  });

  it('never writes the key itself to Web Storage', async () => {
    await activateWalletKey(KEY);

    const dumped = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(dumped).not.toContain(KEY_NO_PREFIX);
  });
});

describe('a later page load restores without asking the user', () => {
  it('rebuilds the session from the vault record', async () => {
    // The state after a refresh: timestamp on disk, nothing in memory.
    localStorage.setItem(UNLOCKED_AT, String(Date.now()));
    vault.readVaultSession.mockResolvedValue({
      privKeyHex: KEY_NO_PREFIX, address: ADDRESS, unlockedAt: Date.now(),
    });

    expect(isWalletUnlocked()).toBe(false); // nothing in memory yet
    const provider = await restoreWalletSession();

    expect(provider).not.toBeNull();
    expect(isWalletUnlocked()).toBe(true);
  });

  it('does one read when several callers race on first paint', async () => {
    localStorage.setItem(UNLOCKED_AT, String(Date.now()));
    vault.readVaultSession.mockResolvedValue({
      privKeyHex: KEY_NO_PREFIX, address: ADDRESS, unlockedAt: Date.now(),
    });

    await Promise.all([restoreWalletSession(), restoreWalletSession(), restoreWalletSession()]);

    expect(vault.readVaultSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the original unlock time rather than extending the window', async () => {
    const unlockedAt = Date.now() - 60 * 60 * 1000; // an hour ago
    localStorage.setItem(UNLOCKED_AT, String(unlockedAt));
    vault.readVaultSession.mockResolvedValue({ privKeyHex: KEY_NO_PREFIX, address: ADDRESS, unlockedAt });

    await restoreWalletSession();

    expect(Number(localStorage.getItem(UNLOCKED_AT))).toBe(unlockedAt);
  });

  it('returns null when there is no record, so the caller prompts', async () => {
    localStorage.setItem(UNLOCKED_AT, String(Date.now()));
    vault.readVaultSession.mockResolvedValue(null);

    expect(await restoreWalletSession()).toBeNull();
    expect(isWalletUnlocked()).toBe(false);
  });

  it('does not even read the vault when no unlock was ever recorded', async () => {
    expect(await restoreWalletSession()).toBeNull();
    expect(vault.readVaultSession).not.toHaveBeenCalled();
  });
});

describe('the auto-lock interval still bounds it', () => {
  it('refuses a record older than the configured interval and clears it', async () => {
    localStorage.setItem(WALLET_UNLOCK_INTERVAL_KEY, '15m');
    localStorage.setItem(UNLOCKED_AT, String(Date.now() - 20 * 60 * 1000));

    expect(await restoreWalletSession()).toBeNull();
    expect(vault.clearVaultSession).toHaveBeenCalled();
    expect(localStorage.getItem(UNLOCKED_AT)).toBeNull();
  });

  it('restores a record inside the interval', async () => {
    const unlockedAt = Date.now() - 5 * 60 * 1000;
    localStorage.setItem(WALLET_UNLOCK_INTERVAL_KEY, '15m');
    localStorage.setItem(UNLOCKED_AT, String(unlockedAt));
    vault.readVaultSession.mockResolvedValue({ privKeyHex: KEY_NO_PREFIX, address: ADDRESS, unlockedAt });

    expect(await restoreWalletSession()).not.toBeNull();
  });
});

describe('locking', () => {
  it('destroys the persisted copy too, or logout would not log out', async () => {
    await activateWalletKey(KEY);
    vault.clearVaultSession.mockClear();

    lockWallet();

    expect(vault.clearVaultSession).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(UNLOCKED_AT)).toBeNull();
    expect(isWalletUnlocked()).toBe(false);
  });
});
