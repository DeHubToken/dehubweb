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

  it('setAuthToken stores token and timestamp', () => {
    setAuthToken('abc123');
    expect(localStorage.getItem('dehub_token')).toBe('abc123');
    expect(localStorage.getItem('dehub_token_timestamp')).toBeTruthy();
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

  it('isTokenExpired returns false for fresh token', () => {
    localStorage.setItem('dehub_token_timestamp', String(Date.now()));
    expect(isTokenExpired()).toBe(false);
  });

  it('isTokenExpired returns true for old token', () => {
    const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    localStorage.setItem('dehub_token_timestamp', String(oldTime));
    expect(isTokenExpired()).toBe(true);
  });

  it('clearAuthSession removes all auth keys', () => {
    localStorage.setItem('dehub_token', 'x');
    localStorage.setItem('dehub_token_timestamp', 'y');
    localStorage.setItem('dehub_wallet', 'z');
    clearAuthSession();
    expect(localStorage.getItem('dehub_token')).toBeNull();
    expect(localStorage.getItem('dehub_token_timestamp')).toBeNull();
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

  it('throws when requiresAuth and no token', async () => {
    await expect(apiCall('/api/test', { requiresAuth: true }))
      .rejects.toThrow('Authentication required');
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
});
