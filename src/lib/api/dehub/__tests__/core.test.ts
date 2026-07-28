import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DEHUB_CDN_BASE,
  DEHUB_API_BASE,
  getMediaUrl,
  AuthenticationError,
  setAuthToken,
  getAuthToken,
  isTokenExpired,
  clearAuthSession,
  apiCall,
  setRefreshToken,
  getRefreshToken,
  setTokenExpiresAt,
  refreshTokenSharedDetailed,
} from '@/lib/api/dehub/core';

// ── getMediaUrl ──

describe('getMediaUrl', () => {
  it('returns undefined for falsy input', () => {
    expect(getMediaUrl(undefined)).toBeUndefined();
    expect(getMediaUrl('')).toBeUndefined();
  });

  it('returns absolute URLs unchanged', () => {
    const url = 'https://example.com/img.png';
    expect(getMediaUrl(url)).toBe(url);
    expect(getMediaUrl('http://foo.com/bar')).toBe('http://foo.com/bar');
  });

  it('prepends CDN base for relative paths', () => {
    expect(getMediaUrl('images/123.jpg')).toBe(`${DEHUB_CDN_BASE}images/123.jpg`);
  });
});

// ── AuthenticationError ──

describe('AuthenticationError', () => {
  it('creates with default message', () => {
    const err = new AuthenticationError();
    expect(err.message).toBe('Session expired. Please sign in again.');
    expect(err.name).toBe('AuthenticationError');
    expect(err).toBeInstanceOf(Error);
  });

  it('creates with custom message', () => {
    const err = new AuthenticationError('Custom msg');
    expect(err.message).toBe('Custom msg');
  });
});

// ── Token Management ──

describe('Token management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setAuthToken stores token', () => {
    setAuthToken('abc123');
    expect(localStorage.getItem('dehub_token')).toBe('abc123');
  });

  it('setTokenExpiresAt stores expiry timestamp', () => {
    setTokenExpiresAt(900); // 15 min
    const stored = localStorage.getItem('dehub_token_expires_at');
    expect(stored).toBeTruthy();
    expect(parseInt(stored!, 10)).toBeGreaterThan(Date.now());
  });

  it('setRefreshToken stores and retrieves refresh token', () => {
    setRefreshToken('rt_abc');
    expect(getRefreshToken()).toBe('rt_abc');
    setRefreshToken(null);
    expect(getRefreshToken()).toBeNull();
  });

  it('setAuthToken(null) clears storage', () => {
    setAuthToken('abc123');
    setAuthToken(null);
    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_token_timestamp')).toBeNull();
  });

  it('getAuthToken reads from localStorage', () => {
    expect(getAuthToken()).toBeNull();
    localStorage.setItem('dehub_token', 'xyz');
    expect(getAuthToken()).toBe('xyz');
  });

  it('isTokenExpired returns true when no timestamp', () => {
    expect(isTokenExpired()).toBe(true);
  });

  it('isTokenExpired returns false for fresh token (new format)', () => {
    setTokenExpiresAt(900); // 15 min from now
    expect(isTokenExpired()).toBe(false);
  });

  it('isTokenExpired returns false for fresh token (legacy format)', () => {
    localStorage.setItem('dehub_token_timestamp', String(Date.now()));
    expect(isTokenExpired()).toBe(false);
  });

  it('isTokenExpired returns true for old token', () => {
    const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    localStorage.setItem('dehub_token_timestamp', String(oldTime));
    expect(isTokenExpired()).toBe(true);
  });

  it('clearAuthSession removes all auth keys including refresh token', () => {
    localStorage.setItem('dehub_token', 'x');
    localStorage.setItem('dehub_token_timestamp', 'y');
    localStorage.setItem('dehub_token_expires_at', 'z');
    localStorage.setItem('dehub_refresh_token', 'rt');
    localStorage.setItem('dehub_wallet', 'w');
    clearAuthSession();
    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_token_timestamp')).toBeNull();
    expect(localStorage.getItem('dehub_token_expires_at')).toBeNull();
    expect(localStorage.getItem('dehub_refresh_token')).toBeNull();
    expect(localStorage.getItem('dehub_wallet')).toBeNull();
  });
});

// ── apiCall ──

describe('apiCall', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws AuthenticationError when requiresAuth and no session to recover', async () => {
    // No token and no refresh token: unrecoverable, and the error type must be
    // one the UI can act on by prompting re-auth.
    await expect(apiCall('/api/test', { requiresAuth: true }))
      .rejects.toThrow(AuthenticationError);
  });

  it('makes GET request with correct URL and headers', async () => {
    const mockResponse = { status: true, data: 'ok' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await apiCall('/api/test', { params: { page: '1' } });
    
    expect(fetch).toHaveBeenCalledOnce();
    const call = vi.mocked(fetch).mock.calls[0];
    const url = call[0] as string;
    expect(url).toContain(`${DEHUB_API_BASE}/api/test`);
    expect(url).toContain('page=1');
    expect(result).toEqual(mockResponse);
  });

  it('includes auth header when token exists', async () => {
    localStorage.setItem('dehub_token', 'mytoken');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await apiCall('/api/test');

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer mytoken');
  });

  it('throws AuthenticationError on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    );

    await expect(apiCall('/api/test')).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError on 403 with auth message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid token' }), { status: 403 })
    );

    await expect(apiCall('/api/test')).rejects.toThrow(AuthenticationError);
  });

  it('throws generic Error on non-auth failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })
    );

    await expect(apiCall('/api/test')).rejects.toThrow('Not found');
  });

  it('sends POST body as JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await apiCall('/api/test', { method: 'POST', body: { foo: 'bar' } });

    const opts = vi.mocked(fetch).mock.calls[0][1];
    expect(opts?.method).toBe('POST');
    expect(opts?.body).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('does not retry twice on repeated 401 after refresh', async () => {
    localStorage.setItem('dehub_token', 'old-token');
    localStorage.setItem('dehub_refresh_token', 'rt_valid');

    const expiredResponse = () =>
      new Response(JSON.stringify({ message: 'Access token expired' }), { status: 401 });

    // First call: 401 expired → refresh succeeds → retry also 401 expired → should NOT refresh again
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(expiredResponse()) // original request
      .mockResolvedValueOnce( // refresh endpoint succeeds
        new Response(JSON.stringify({ accessToken: 'new-token', refreshToken: 'rt_new', expiresIn: 900 }), { status: 200 })
      )
      .mockResolvedValueOnce(expiredResponse()); // retried request still 401

    await expect(apiCall('/api/test')).rejects.toThrow(AuthenticationError);
    // Should have called fetch exactly 3 times (original, refresh, retry) — no second refresh
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('attempts refresh on a 401 whose body does not say "access token expired"', async () => {
    localStorage.setItem('dehub_token', 'some-token');
    localStorage.setItem('dehub_refresh_token', 'rt_valid');

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'new-token', refreshToken: 'rt_new', expiresIn: 900 }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    // Gating refresh on one exact server phrase meant any rewording — or a
    // bodyless 401 from a proxy — silently killed session recovery.
    await expect(apiCall('/api/test')).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem('dehub_token')).toBe('new-token');
  });

  it('does not attempt refresh on a 401 when no refresh token is stored', async () => {
    localStorage.setItem('dehub_token', 'some-token');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    );

    await expect(apiCall('/api/test')).rejects.toThrow(AuthenticationError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a transient error, not "session expired", when refresh fails on a network blip', async () => {
    localStorage.setItem('dehub_token', 'some-token');
    localStorage.setItem('dehub_refresh_token', 'rt_valid');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Access token expired' }), { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // A blip must not be reported as a dead session, and must not clear the
    // refresh token the server never rejected.
    await expect(apiCall('/api/test')).rejects.not.toBeInstanceOf(AuthenticationError);
    expect(localStorage.getItem('dehub_refresh_token')).toBe('rt_valid');
  });
});

// ── refreshTokenSharedDetailed ──

describe('refreshTokenSharedDetailed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports no-refresh-token when nothing is stored', async () => {
    await expect(refreshTokenSharedDetailed()).resolves.toEqual({
      ok: false,
      reason: 'no-refresh-token',
    });
  });

  it('reports revoked and clears the session on a 401', async () => {
    localStorage.setItem('dehub_token', 'tok');
    localStorage.setItem('dehub_refresh_token', 'rt_dead');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid refresh token' }), { status: 401 })
    );

    await expect(refreshTokenSharedDetailed()).resolves.toEqual({ ok: false, reason: 'revoked' });
    expect(localStorage.getItem('dehub_refresh_token')).toBeNull();
  });

  it('reports transient and KEEPS the session on a 503', async () => {
    localStorage.setItem('dehub_token', 'tok');
    localStorage.setItem('dehub_refresh_token', 'rt_valid');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('gateway down', { status: 503 })
    );

    await expect(refreshTokenSharedDetailed()).resolves.toEqual({ ok: false, reason: 'transient' });
    // The server never rejected this token — losing it here is what logs
    // people out when a phone wakes up before its radio is ready.
    expect(localStorage.getItem('dehub_refresh_token')).toBe('rt_valid');
  });

  it('reports transient and KEEPS the session on a network error', async () => {
    localStorage.setItem('dehub_refresh_token', 'rt_valid');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(refreshTokenSharedDetailed()).resolves.toEqual({ ok: false, reason: 'transient' });
    expect(localStorage.getItem('dehub_refresh_token')).toBe('rt_valid');
  });

  it('shares one in-flight request across concurrent callers', async () => {
    localStorage.setItem('dehub_refresh_token', 'rt_valid');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'a', refreshToken: 'b', expiresIn: 900 }), { status: 200 })
    );

    // Rotating-refresh-token servers treat a replayed token as theft and can
    // revoke the whole session family, so concurrent callers must coalesce.
    const [one, two, three] = await Promise.all([
      refreshTokenSharedDetailed(),
      refreshTokenSharedDetailed(),
      refreshTokenSharedDetailed(),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(one).toEqual(two);
    expect(two).toEqual(three);
  });
});
