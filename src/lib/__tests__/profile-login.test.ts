import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateProfileSession } from '../profile-login';

const mocks = vi.hoisted(() => ({ session: vi.fn(), exchange: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock('@/lib/api/dehub/auth', () => ({ authenticateWithSupabaseSession: mocks.exchange }));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'google-user' }, access_token: 'identity-token' } } });
});

describe('profile identity login', () => {
  it.each([null, '0x2222222222222222222222222222222222222222'])('uses the authenticated profile even with unavailable or different wallet storage (%s)', async (wallet) => {
    if (wallet) localStorage.setItem('dehub_wallet_enc', JSON.stringify({ ethAddress: wallet, payload: null }));
    const profile = { token: 'profile-token', user: { address: '0x1111111111111111111111111111111111111111' } };
    mocks.exchange.mockResolvedValue(profile);
    await expect(authenticateProfileSession('google-user')).resolves.toBe(profile);
    expect(mocks.exchange).toHaveBeenCalledWith('identity-token');
  });

  it('refuses a session belonging to another identity', async () => {
    await expect(authenticateProfileSession('different-user')).rejects.toThrow('session expired');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('refuses a missing identity session', async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    await expect(authenticateProfileSession('google-user')).rejects.toThrow('session expired');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('reports an exchange failure without starting wallet recovery', async () => {
    mocks.exchange.mockRejectedValue(new Error('Authentication unavailable'));
    await expect(authenticateProfileSession('google-user')).rejects.toThrow('Authentication unavailable');
    expect(mocks.exchange).toHaveBeenCalledTimes(1);
  });
});
