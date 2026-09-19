import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ wallet: vi.fn(), wraps: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user' } } } }) } } }));
vi.mock('../store', () => ({ fetchWallet: mocks.wallet, getCachedWallet: () => null }));
vi.mock('../passkey-store', () => ({ loadPasskeyWraps: mocks.wraps, getCachedPasskeyWraps: () => [] }));
vi.mock('../passkey', () => ({ isBiometricUnlockAvailable: async () => true }));
vi.mock('../crypto', () => ({ classifyPayloadKind: (value: string) => value }));
import { getWalletProtection } from '../protection';

beforeEach(() => {
  mocks.wraps.mockRejectedValue(new Error('offline'));
});

it('shows unknown rather than lost-device recovery when a biometric backup query fails', async () => {
  mocks.wallet.mockResolvedValue({ ethAddress: 'address', payload: { ciphertext: 'passkey' } });
  expect((await getWalletProtection('user')).stateUnknown).toBe(true);
});

it('retains password unlock when only the biometric backup query fails', async () => {
  mocks.wallet.mockResolvedValue({ ethAddress: 'address', payload: { ciphertext: 'password' } });
  const protection = await getWalletProtection('user');
  expect(protection.stateUnknown).toBe(false);
  expect(protection.hasPassword).toBe(true);
});
