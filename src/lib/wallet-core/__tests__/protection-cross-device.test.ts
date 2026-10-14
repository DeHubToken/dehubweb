import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user' } } } }) } } }));
vi.mock('../store', () => ({ fetchWallet: async () => ({ ethAddress: 'address', payload: null }), getCachedWallet: () => null }));
vi.mock('../passkey-store', () => ({ loadPasskeyWraps: async () => [{ credentialId: 'phone', transports: ['hybrid'] }], getCachedPasskeyWraps: () => [] }));
vi.mock('../passkey', () => ({ isBiometricUnlockAvailable: async () => false }));
import { getWalletProtection } from '../protection';

afterEach(() => vi.unstubAllGlobals());
it('offers a saved phone passkey on a browser without a platform authenticator', async () => {
  vi.stubGlobal('window', { isSecureContext: true, PublicKeyCredential: {} });
  vi.stubGlobal('navigator', { credentials: { get: vi.fn() } });
  const protection = await getWalletProtection('user');
  expect(protection.biometricAvailable).toBe(false);
  expect(protection.canUseBiometrics).toBe(true);
});
it('does not offer a passkey in an insecure context', async () => {
  vi.stubGlobal('window', { isSecureContext: false, PublicKeyCredential: {} });
  vi.stubGlobal('navigator', { credentials: { get: vi.fn() } });
  expect((await getWalletProtection('user')).canUseBiometrics).toBe(false);
});
