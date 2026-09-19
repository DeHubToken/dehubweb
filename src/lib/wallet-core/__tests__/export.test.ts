import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportWalletPrivateKey } from '../export';
import { fetchWallet, getCachedWallet } from '../store';
import { decryptString } from '../crypto';
import { assertWalletAddress } from '../assert-wallet-address';
import { unlockWithBiometrics } from '../biometric-unlock';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: vi.fn(async () => ({ data: { session: null } })),
} } }));
vi.mock('../store', () => ({ fetchWallet: vi.fn(), getCachedWallet: vi.fn() }));
vi.mock('../crypto', () => ({ decryptString: vi.fn(), classifyPayloadKind: () => 'password' }));
vi.mock('../derive', () => ({ deriveFromSecret: () => ({ ethAddress: 'owner', ethPrivateKey: 'test-key' }) }));
vi.mock('../assert-wallet-address', () => ({ assertWalletAddress: vi.fn() }));
vi.mock('../passkey', () => ({ isBiometricUnlockAvailable: async () => true }));
vi.mock('../passkey-store', () => ({ loadPasskeyWraps: async () => [], getCachedPasskeyWraps: () => [{ credentialId: 'cached' }] }));
vi.mock('../biometric-unlock', () => ({ unlockWithBiometrics: vi.fn(async () => 'secret') }));

describe('private key export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWallet).mockResolvedValue(null);
    vi.mocked(getCachedWallet).mockReturnValue({ ethAddress: 'owner', payload: { ciphertext: 'encrypted', salt: '', iv: '', iterations: 0 } });
    vi.mocked(decryptString).mockResolvedValue('secret');
    vi.mocked(assertWalletAddress).mockResolvedValue(undefined);
  });
  it('exports the encrypted local backup when an expired session hides the cloud row', async () => {
    await expect(exportWalletPrivateKey('user', 'active-safe', 'password')).resolves.toBe('test-key');
    expect(decryptString).toHaveBeenCalledWith(expect.objectContaining({ ciphertext: 'encrypted' }), 'password');
    expect(assertWalletAddress).toHaveBeenCalledWith('owner', 'active-safe');
  });
  it('also uses the backup after a network failure', async () => {
    vi.mocked(fetchWallet).mockRejectedValue(new Error('offline'));
    await expect(exportWalletPrivateKey('user', 'active-safe', 'password')).resolves.toBe('test-key');
  });
  it('never reveals a cached key belonging to another active account', async () => {
    vi.mocked(assertWalletAddress).mockImplementation(async (_, expected) => {
      if (expected === 'other-account') throw new Error('different wallet');
    });
    await expect(exportWalletPrivateKey('user', 'other-account', 'password')).rejects.toThrow('different wallet');
  });
  it('still requires the correct password', async () => {
    vi.mocked(decryptString).mockRejectedValue(new Error('Incorrect password'));
    await expect(exportWalletPrivateKey('user', 'active-safe', 'wrong')).rejects.toThrow('Incorrect password');
  });
  it('requires fresh biometrics and supplies cached wraps when the session expired', async () => {
    await expect(exportWalletPrivateKey('user', 'active-safe')).resolves.toBe('test-key');
    expect(unlockWithBiometrics).toHaveBeenCalledWith('user', [{ credentialId: 'cached' }]);
  });
  it('can validate biometric recovery against the account even without a wallet row', async () => {
    vi.mocked(getCachedWallet).mockReturnValue(null);
    await expect(exportWalletPrivateKey('user', 'active-safe')).resolves.toBe('test-key');
    expect(assertWalletAddress).toHaveBeenCalledWith('owner', 'active-safe');
  });
  it('explains unavailable backups without claiming the wallet is gone', async () => {
    vi.mocked(getCachedWallet).mockReturnValue(null);
    await expect(exportWalletPrivateKey('user', 'active-safe', 'password')).rejects.toThrow('encrypted wallet backup is unavailable');
  });
});
