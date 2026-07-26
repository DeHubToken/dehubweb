/**
 * authedUpload() — the multipart path behind posting.
 *
 * These tests exist because of a specific production report: users had to sign
 * out and back in before they could post. mintPost used a hand-rolled
 * XMLHttpRequest that snapshotted the access token, never checked expiry, and
 * had no 401 handling, so a session that expired while the user was composing
 * produced a dead-end "HTTP 401" that only a full re-login cleared.
 *
 * The scenarios below are that bug, expressed as tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authedUpload,
  AuthenticationError,
  setAuthToken,
  setRefreshToken,
  setTokenExpiresAt,
} from '@/lib/api/dehub/core';

interface QueuedResponse {
  status: number;
  body: string;
}

class MockXhr {
  static sent: MockXhr[] = [];
  static queue: QueuedResponse[] = [];
  static networkError = false;

  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  timeout = 0;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: unknown) {
    this.body = body;
    MockXhr.sent.push(this);

    queueMicrotask(() => {
      if (MockXhr.networkError) {
        this.onerror?.();
        return;
      }
      // Report a progress tick so onProgress wiring is exercised.
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });

      const next = MockXhr.queue.shift();
      if (!next) throw new Error('MockXhr: no queued response');
      this.status = next.status;
      this.responseText = next.body;
      this.onload?.();
    });
  }

  static reset() {
    MockXhr.sent = [];
    MockXhr.queue = [];
    MockXhr.networkError = false;
  }
}

const originalXhr = globalThis.XMLHttpRequest;

/** Give the caller a live, non-expired session. */
function withValidSession() {
  setAuthToken('tok-valid');
  setTokenExpiresAt(900);
  setRefreshToken('rt-valid');
}

/** Access token already dead, refresh token still good. */
function withExpiredAccessToken() {
  setAuthToken('tok-stale');
  setTokenExpiresAt(-60); // expired a minute ago
  setRefreshToken('rt-valid');
}

function refreshSucceeds(accessToken = 'tok-fresh') {
  return new Response(
    JSON.stringify({ accessToken, refreshToken: 'rt-next', expiresIn: 900 }),
    { status: 200 },
  );
}

describe('authedUpload', () => {
  beforeEach(() => {
    localStorage.clear();
    MockXhr.reset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.XMLHttpRequest = MockXhr as any;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr;
    vi.restoreAllMocks();
  });

  it('sends the bearer token and returns the parsed body', async () => {
    withValidSession();
    MockXhr.queue.push({ status: 200, body: JSON.stringify({ createdTokenId: 7 }) });

    const result = await authedUpload<{ createdTokenId: number }>(
      '/api/user_mint',
      new FormData(),
    );

    expect(result).toEqual({ createdTokenId: 7 });
    expect(MockXhr.sent).toHaveLength(1);
    expect(MockXhr.sent[0].headers['Authorization']).toBe('Bearer tok-valid');
    expect(MockXhr.sent[0].url).toContain('/api/user_mint');
  });

  it('unwraps a { result: … } envelope when asked', async () => {
    withValidSession();
    MockXhr.queue.push({ status: 200, body: JSON.stringify({ result: { r: '0x1' } }) });

    const result = await authedUpload<{ r: string }>('/api/user_mint', new FormData(), {
      unwrapResult: true,
    });

    expect(result).toEqual({ r: '0x1' });
  });

  it('reports upload progress', async () => {
    withValidSession();
    MockXhr.queue.push({ status: 200, body: '{}' });
    const onProgress = vi.fn();

    await authedUpload('/api/user_mint', new FormData(), { onProgress });

    expect(onProgress).toHaveBeenCalledWith(50);
  });

  // ── The reported bug ──

  it('refreshes an already-expired token BEFORE uploading, without a wasted attempt', async () => {
    withExpiredAccessToken();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(refreshSucceeds());
    MockXhr.queue.push({ status: 200, body: JSON.stringify({ ok: true }) });

    // The old code would have pushed the whole file over the wire with a dead
    // token and only then discovered the 401.
    await expect(authedUpload('/api/user_mint', new FormData())).resolves.toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1); // the refresh
    expect(MockXhr.sent).toHaveLength(1); // exactly one upload
    expect(MockXhr.sent[0].headers['Authorization']).toBe('Bearer tok-fresh');
  });

  it('refreshes and replays once when the token dies mid-flight (401)', async () => {
    // Token looks valid locally, but the server disagrees — clock skew, or it
    // expired between the check and the request landing.
    withValidSession();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(refreshSucceeds('tok-after-401'));
    MockXhr.queue.push({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
    MockXhr.queue.push({ status: 200, body: JSON.stringify({ createdTokenId: 9 }) });

    const result = await authedUpload<{ createdTokenId: number }>(
      '/api/user_mint',
      new FormData(),
    );

    expect(result).toEqual({ createdTokenId: 9 });
    expect(MockXhr.sent).toHaveLength(2);
    expect(MockXhr.sent[0].headers['Authorization']).toBe('Bearer tok-valid');
    expect(MockXhr.sent[1].headers['Authorization']).toBe('Bearer tok-after-401');
  });

  it('does not replay more than once', async () => {
    withValidSession();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(refreshSucceeds());
    MockXhr.queue.push({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
    MockXhr.queue.push({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });

    await expect(authedUpload('/api/user_mint', new FormData())).rejects.toThrow(
      AuthenticationError,
    );
    expect(MockXhr.sent).toHaveLength(2);
  });

  it('throws AuthenticationError when the refresh token is revoked', async () => {
    withExpiredAccessToken();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid refresh token' }), { status: 401 }),
    );

    // Genuinely dead session: the UI needs the typed error so it can prompt a
    // sign-in rather than printing an HTTP status at the user.
    await expect(authedUpload('/api/user_mint', new FormData())).rejects.toThrow(
      AuthenticationError,
    );
    expect(MockXhr.sent).toHaveLength(0);
  });

  it('does NOT claim "session expired" when the refresh merely failed on a network blip', async () => {
    withExpiredAccessToken();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    // Telling a user with a perfectly good refresh token to sign in again is
    // exactly the behaviour being fixed.
    const err = await authedUpload('/api/user_mint', new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AuthenticationError);
    expect(localStorage.getItem('dehub_refresh_token')).toBe('rt-valid');
  });

  it('surfaces non-auth HTTP failures as ordinary errors', async () => {
    withValidSession();
    MockXhr.queue.push({ status: 413, body: JSON.stringify({ message: 'File too large' }) });

    const err = await authedUpload('/api/user_mint', new FormData()).catch((e) => e);
    expect(err).not.toBeInstanceOf(AuthenticationError);
    expect(err.message).toContain('File too large');
  });

  it('surfaces a network failure as a connection error, not a dead session', async () => {
    withValidSession();
    MockXhr.networkError = true;

    const err = await authedUpload('/api/user_mint', new FormData()).catch((e) => e);
    expect(err).not.toBeInstanceOf(AuthenticationError);
    expect(err.message).toMatch(/connection/i);
  });
});
