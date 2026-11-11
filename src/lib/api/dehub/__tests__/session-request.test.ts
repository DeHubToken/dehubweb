import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSession } from '../session-request';
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe('session request recovery', () => {
  it('reuses the proof once through the relay without asking for another signature', async () => {
    const response = new Response('{}', { status: 201 });
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    const init = { method: 'POST', body: JSON.stringify({ sig: 'proof', timestamp: 123 }) };
    await expect(requestSession('/api/web/auth', init)).resolves.toBe(response);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.dehub.io/api/web/auth');
    expect(fetchMock.mock.calls[1][0]).toBe('https://riftn.com/_api/api/web/auth');
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });
  it('returns HTTP refusals directly and stops after two transport failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await requestSession('/api/web/auth', { method: 'POST' })).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(requestSession('/api/web/auth', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('two-step sign-in', () => {
  const required = () => new Response(JSON.stringify({
    code: 'TWO_FACTOR_REQUIRED', challenge: 'ch1', account: { username: 'mal' },
  }), { status: 403 });

  it('pauses for the code and hands back the session the code unlocked', async () => {
    const { getTwoFactorPrompt } = await import('@/lib/two-factor-login');
    localStorage.removeItem('riftn.2fa.trust');
    const session = new Response(JSON.stringify({ token: 't', twoFactorTrust: 'trust1' }), { status: 201 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(required())
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'That code didn’t match.' }), { status: 401 }))
      .mockResolvedValueOnce(session);
    vi.stubGlobal('fetch', fetchMock);

    const pending = requestSession('/api/web/auth', { method: 'POST', body: JSON.stringify({ sig: 'proof' }) });
    await vi.waitFor(() => expect(getTwoFactorPrompt()).not.toBeNull());
    const prompt = getTwoFactorPrompt()!;
    expect(prompt.account.username).toBe('mal');

    await expect(prompt.submit({ code: '000000', trustDevice: true })).rejects.toThrow('That code didn’t match.');
    expect(getTwoFactorPrompt()).toBe(prompt);
    await prompt.submit({ code: '123456', trustDevice: true });

    await expect(pending).resolves.toBe(session);
    expect(getTwoFactorPrompt()).toBeNull();
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.dehub.io/api/auth/2fa/verify');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ challenge: 'ch1', code: '123456', trustDevice: true });

    // The trusted device token rides along on the next login.
    fetchMock.mockReset().mockResolvedValueOnce(new Response('{}', { status: 201 }));
    await requestSession('/api/web/auth', { method: 'POST', body: JSON.stringify({ sig: 'proof' }) });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).twoFactorTrust).toEqual(['trust1']);
  });

  it('closing the code step ends the login as a user cancel', async () => {
    const { getTwoFactorPrompt } = await import('@/lib/two-factor-login');
    const { isUserRejection } = await import('@/lib/wallet-errors');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(required()));
    const pending = requestSession('/api/web/auth/supabase', { method: 'POST', body: '{}' });
    await vi.waitFor(() => expect(getTwoFactorPrompt()).not.toBeNull());
    getTwoFactorPrompt()!.cancel();
    const error = await pending.catch((e) => e);
    expect(isUserRejection(error)).toBe(true);
    expect(getTwoFactorPrompt()).toBeNull();
  });
});
