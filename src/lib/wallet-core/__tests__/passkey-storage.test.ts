import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), single: vi.fn(), order: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({
    upsert: mocks.upsert,
    select: () => ({ eq: () => ({ order: mocks.order }) }),
  }) },
}));
import { loadPasskeyWraps, savePasskeyWrap } from '../passkey-store';

const wrap = { credentialId: 'credential', prfSalt: 'prf-salt', payload: { ciphertext: 'encrypted', salt: 'salt', iv: 'iv', iterations: 0 } };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) });
});

it('does not report missing biometrics when the server fails and no cached backup exists', async () => {
  mocks.order.mockResolvedValue({ data: null, error: { message: 'connection unavailable' } });
  await expect(loadPasskeyWraps('user')).rejects.toThrow('connection unavailable');
});

it('preserves offline unlock when an encrypted backup is cached', async () => {
  localStorage.setItem('dehub_wallet_passkeys', JSON.stringify([wrap]));
  mocks.order.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(loadPasskeyWraps('user')).resolves.toEqual([wrap]);
});

it('does not confirm biometric enrollment without the saved ciphertext', async () => {
  mocks.single.mockResolvedValue({ data: null, error: null });
  await expect(savePasskeyWrap('user', wrap)).rejects.toThrow('could not be verified');
});

it('rejects a returned backup for another identity', async () => {
  mocks.single.mockResolvedValue({ data: { user_id: 'other', credential_id: 'credential', encrypted_seed: 'encrypted', salt: 'salt', iv: 'iv', prf_salt: 'prf-salt' }, error: null });
  await expect(savePasskeyWrap('user', wrap)).rejects.toThrow('could not be verified');
});

it('confirms an exact saved backup', async () => {
  mocks.single.mockResolvedValue({ data: { user_id: 'user', credential_id: 'credential', encrypted_seed: 'encrypted', salt: 'salt', iv: 'iv', prf_salt: 'prf-salt' }, error: null });
  await expect(savePasskeyWrap('user', wrap)).resolves.toBeUndefined();
});
