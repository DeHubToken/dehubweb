/**
 * Tests for authenticateWithSupabaseSession — the call that lets login finish
 * without unlocking the wallet.
 *
 * The behaviour that matters is the FAILURE handling, not the happy path: every
 * failure mode has to be distinguishable, because the caller reacts differently.
 * A 409 means "sign once to link this identity" and must fall back silently; a
 * 503 means the server has the endpoint switched off and must ALSO fall back
 * rather than stranding the user. Getting these confused either dead-ends a
 * login or hides a real outage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { authenticateWithSupabaseSession, WalletNotLinkedError } from '@/lib/api/dehub/auth';

const predict = vi.hoisted(() => vi.fn());
vi.mock('@/lib/smart-account-address', () => ({ predictSafeAddress: predict }));

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

function successBody() {
  return {
    status: true,
    token: 'dehub-access-token',
    refreshToken: 'dehub-refresh-token',
    expiresIn: 900,
    user: { address: ADDRESS, username: 'someone' },
    result: { address: ADDRESS, isNewAccount: false },
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('authenticateWithSupabaseSession', () => {
  it('accepts the existing Safe profile for its owner EOA', async () => {
    const owner = '0x0e240d0eaa38f6c210afab2925cda30e0b86882b';
    const safe = '0xd627ad6a37e91985b9413a721a000feed9d9125f';
    predict.mockResolvedValue(safe);
    mockFetch({ ...successBody(), user: { address: safe, username: 'dehu_b' } });
    expect((await authenticateWithSupabaseSession('supabase-jwt', owner)).user.username).toBe('dehu_b');
  });

  it('rejects a different identity before persisting its tokens', async () => {
    predict.mockResolvedValue('0x2222222222222222222222222222222222222222');
    mockFetch(successBody());
    await expect(authenticateWithSupabaseSession('supabase-jwt', '0x1111111111111111111111111111111111111111')).rejects.toThrow('confirm your existing profile');
    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_refresh_token')).toBeNull();
  });

  it('posts to the supabase exchange endpoint', async () => {
    mockFetch(successBody());
    await authenticateWithSupabaseSession('supabase-jwt');

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`${DEHUB_API_BASE}/api/web/auth/supabase`);
    expect(opts?.method).toBe('POST');
  });

  it('sends the Supabase token as a bearer header, not in the body', async () => {
    mockFetch(successBody());
    await authenticateWithSupabaseSession('supabase-jwt');

    const opts = vi.mocked(fetch).mock.calls[0][1];
    expect((opts?.headers as Record<string, string>).Authorization).toBe('Bearer supabase-jwt');
    // Body-logging middleware should never see the credential.
    expect(String(opts?.body)).not.toContain('supabase-jwt');
  });

  it('sends the expected wallet address for server-side link recovery', async () => {
    mockFetch(successBody());
    await authenticateWithSupabaseSession('supabase-jwt', ADDRESS);

    const opts = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(opts?.body))).toEqual({ expectedAddress: ADDRESS });
    expect(String(opts?.body)).not.toContain('supabase-jwt');
  });

  it('stores the session on success', async () => {
    mockFetch(successBody());
    const data = await authenticateWithSupabaseSession('supabase-jwt');

    expect(data.user?.address).toBe(ADDRESS);
    expect(localStorage.getItem('dehub_token')).toBe('dehub-access-token');
    expect(localStorage.getItem('dehub_refresh_token')).toBe('dehub-refresh-token');
  });

  it('raises WalletNotLinkedError on 409 so the caller can fall back to signing', async () => {
    mockFetch({ status: false, code: 'WALLET_NOT_LINKED', message: 'not linked' }, 409);
    await expect(authenticateWithSupabaseSession('supabase-jwt')).rejects.toBeInstanceOf(
      WalletNotLinkedError,
    );
  });

  it('does not treat an ambiguous link as a new signup', async () => {
    mockFetch({ status: false, code: 'WALLET_LINK_AMBIGUOUS', message: 'two wallets' }, 409);
    const error = await authenticateWithSupabaseSession('supabase-jwt').catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WalletNotLinkedError);
  });

  it('does not store a session when the exchange fails', async () => {
    mockFetch({ status: false, code: 'WALLET_NOT_LINKED' }, 409);
    await expect(authenticateWithSupabaseSession('supabase-jwt')).rejects.toThrow();
    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_refresh_token')).toBeNull();
  });

  it.each([{ token: 'token', user: {} }, { user: { address: ADDRESS } }])('rejects incomplete successful responses before persisting tokens', async (body) => {
    mockFetch(body);
    await expect(authenticateWithSupabaseSession('supabase-jwt')).rejects.toThrow('Could not finish');
    expect(localStorage.getItem('dehub_token')).toBeNull();
  });

  it('reports a switched-off endpoint as a plain error, distinct from "not linked"', async () => {
    // The caller falls back for both, but conflating them would hide a
    // misconfigured server behind a message about linking wallets.
    mockFetch({ status: false, code: 'SUPABASE_AUTH_UNAVAILABLE' }, 503);
    const err = await authenticateWithSupabaseSession('supabase-jwt').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WalletNotLinkedError);
  });

  it('reports an invalid Supabase session as a plain error', async () => {
    mockFetch({ status: false, message: 'Invalid or expired Supabase session' }, 401);
    const err = await authenticateWithSupabaseSession('supabase-jwt').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WalletNotLinkedError);
    expect(err.message).toMatch(/Invalid or expired/);
  });

  it('reports a ban as a plain error rather than a linking problem', async () => {
    mockFetch({ status: false, code: 'ACCOUNT_BANNED', message: 'Your account has been banned.' }, 403);
    const err = await authenticateWithSupabaseSession('supabase-jwt').catch((e) => e);
    expect(err).not.toBeInstanceOf(WalletNotLinkedError);
    expect(err.message).toMatch(/banned/);
  });

  it('survives an error response that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    );
    await expect(authenticateWithSupabaseSession('supabase-jwt')).rejects.toThrow(
      /Authentication failed/,
    );
  });
});
