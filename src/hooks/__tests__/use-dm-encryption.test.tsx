import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), setup: vi.fn(), sync: vi.fn(), open: vi.fn(),
  runtime: { isConnected: false, connector: undefined as any },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  isAuthenticated: true, walletAddress: '0x1111111111111111111111111111111111111111',
  connectionSource: 'wagmi', openLoginModal: mocks.open,
}) }));
vi.mock('@/lib/wallet-runtime', () => ({ useWalletRuntime: () => mocks.runtime }));
vi.mock('@/lib/dm-e2ee/keys', () => ({ loadIdentity: mocks.load, setupIdentity: mocks.setup, syncPublishedKey: mocks.sync }));
vi.mock('@/lib/dm-e2ee/signer', () => ({
  signEncryptionMessage: vi.fn(),
  WalletLockedError: class extends Error {},
  WalletConnectionError: class extends Error {},
}));
vi.mock('@/lib/smart-wallet', () => ({ isWalletUnlocked: () => false, WALLET_LOCK_CHANGED_EVENT: 'test:wallet-change' }));

import { useDmEncryption } from '../use-dm-encryption';
import { WalletConnectionError } from '@/lib/dm-e2ee/signer';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockReturnValue(false);
  mocks.sync.mockResolvedValue(undefined);
  mocks.runtime = { isConnected: false, connector: undefined };
});
afterEach(() => cleanup());

describe('encryption setup retry', () => {
  it('keeps a missing wallet actionable and resumes after reconnection', async () => {
    mocks.setup.mockRejectedValueOnce(new WalletConnectionError());
    const { result, rerender } = renderHook(() => useDmEncryption());
    await waitFor(() => expect(result.current.needsWalletConnection).toBe(true));
    expect(result.current.status).toBe('error');
    act(() => { result.current.retry(); });
    expect(mocks.open).toHaveBeenCalledOnce();
    expect(mocks.setup).toHaveBeenCalledOnce();

    mocks.setup.mockResolvedValue({ publicKey: 'published' });
    mocks.runtime = { isConnected: true, connector: { getChainId: () => 8453 } };
    rerender();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.needsWalletConnection).toBe(false);
  });

  it('stays pending until signing completes and retains a retryable failure', async () => {
    let fail!: (error: Error) => void;
    mocks.setup.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const { result } = renderHook(() => useDmEncryption());
    await waitFor(() => expect(result.current.status).toBe('pending'));
    await act(async () => { fail(new Error('Wallet signature failed')); });
    expect(result.current.status).toBe('error');
    expect(result.current.needsWalletConnection).toBe(false);
    mocks.setup.mockResolvedValue({ publicKey: 'published' });
    await act(async () => { await result.current.retry(); });
    expect(result.current.status).toBe('ready');
  });
});
