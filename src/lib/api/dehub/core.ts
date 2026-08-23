// DeHub CDN base URL for media assets
export const DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";

// DeHub API base URL
export const DEHUB_API_BASE = "https://api.dehub.io";

/**
 * Convert relative media paths to absolute CDN URLs
 * The DeHub API returns relative paths like "images/xxx.jpg"
 */
export function getMediaUrl(relativePath?: string): string | undefined {
  if (!relativePath) return undefined;
  if (relativePath.startsWith("data:") || relativePath.startsWith("blob:")) {
    return relativePath;
  }
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  return `${DEHUB_CDN_BASE}${relativePath.replace(/^\/+/, '')}`;
}

/**
 * Custom error class for authentication failures.
 */
export class AuthenticationError extends Error {
  constructor(message: string = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// ── Token Storage ──

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem("dehub_token", token);
  } else {
    localStorage.removeItem("dehub_token");
  }
};

export const setRefreshToken = (token: string | null) => {
  if (token) {
    localStorage.setItem("dehub_refresh_token", token);
  } else {
    localStorage.removeItem("dehub_refresh_token");
  }
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem("dehub_refresh_token");
};

/**
 * Store the absolute timestamp (ms) at which the access token expires.
 * Called after login or token refresh with the server's `expiresIn` (seconds).
 */
export const setTokenExpiresAt = (expiresInSeconds: number) => {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem("dehub_token_expires_at", String(expiresAt));
};

/**
 * Get the current auth token from localStorage.
 * Always reads fresh from localStorage to avoid stale token issues.
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem("dehub_token");
};

export const isTokenExpired = (): boolean => {
  const expiresAt = localStorage.getItem("dehub_token_expires_at");
  if (expiresAt) {
    return Date.now() >= parseInt(expiresAt, 10);
  }
  // Legacy fallback: check old timestamp-based expiry (24h)
  const timestamp = localStorage.getItem("dehub_token_timestamp");
  if (!timestamp) return true;
  const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
  return Date.now() - parseInt(timestamp, 10) >= TOKEN_EXPIRY_MS;
};

export const clearAuthSession = () => {
  localStorage.removeItem("dehub_token");
  localStorage.removeItem("dehub_token_timestamp");
  localStorage.removeItem("dehub_token_expires_at");
  localStorage.removeItem("dehub_refresh_token");
  localStorage.removeItem("dehub_wallet");
  localStorage.removeItem("dehub_supabase_uid");
};

// ── Shared Token Refresh (single-flight, shared across every caller) ──
// Both apiCall's 401 handler below AND the standalone refreshAccessToken()
// exported from auth.ts (called directly by AuthProvider on mount / proactive
// refresh) must funnel through the SAME in-flight promise. Two independent
// refresh calls firing concurrently would both submit the same soon-to-be-
// rotated refresh token — servers that rotate refresh tokens and treat reuse
// as theft can revoke the whole session family when that happens.

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Why a refresh attempt did not produce a new access token.
 *
 * The distinction is the whole point: only `revoked` proves the session is
 * actually dead. Every other reason is a temporary condition — the radio is
 * down, the server hiccuped, the request timed out — where the stored refresh
 * token is still perfectly good. A caller that ends the session on anything
 * but `revoked` logs the user out on a network blip, which is the single most
 * common cause of "I keep getting randomly logged out".
 */
export type TokenRefreshFailure =
  /** Server definitively rejected the refresh token (401). Session is dead. */
  | 'revoked'
  /** No refresh token stored — nothing to refresh with. */
  | 'no-refresh-token'
  /** Network error, timeout, offline, or 5xx/429. Session is probably fine. */
  | 'transient'
  /** 2xx response that carried no access token. Server bug, not a dead session. */
  | 'malformed';

/**
 * The `?: never` fillers are load-bearing. This project compiles with
 * `strictNullChecks: false`, and under that setting TypeScript does not narrow
 * a union by a boolean discriminant — `if (outcome.ok)` leaves the type as the
 * full union, so reading `.reason` in the else branch is a compile error.
 * Declaring both keys on both members keeps the access legal while the literal
 * `ok` types still document which fields are actually populated.
 */
export type TokenRefreshOutcome =
  | { ok: true; tokens: TokenRefreshResult; reason?: never }
  | { ok: false; reason: TokenRefreshFailure; tokens?: never };

let refreshInFlight: Promise<TokenRefreshOutcome> | null = null;

/**
 * Build an abort signal that fires after `ms`.
 *
 * AbortSignal.timeout() is missing in Safari < 16, older Firefox, and jsdom.
 * Calling it unguarded throws a TypeError *before* fetch is even attempted, so
 * on those browsers every refresh failed instantly and the session could never
 * be renewed — the user just got logged out and had no way to prevent it.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(ms), cancel: () => { /* self-clearing */ } };
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

/**
 * Refresh the access token using the stored refresh token, reporting *why* it
 * failed so callers can tell a revoked session apart from a flaky network.
 * Concurrent callers (from this file or auth.ts) share the same in-flight
 * request instead of each firing their own. Updates localStorage on success.
 */
export async function refreshTokenSharedDetailed(): Promise<TokenRefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return { ok: false, reason: 'no-refresh-token' };

  // Captured BEFORE the refresh: whether the old access token was already dead.
  // Any API fetch made in that window went out effectively anonymous, so
  // per-user flags (isLiked, isSaved, isUnlocked…) cached from it are wrong for
  // this user. Listeners (AuthProvider) use this to refetch those caches.
  const wasExpired = isTokenExpired() || !getAuthToken();

  refreshInFlight = (async (): Promise<TokenRefreshOutcome> => {
    // Without a timeout, a stalled request never settles, and the
    // single-flight promise above never resolves — every subsequent
    // caller awaiting it (or gated behind isRefreshing) hangs forever,
    // requiring a full page reload to recover.
    const timeout = timeoutSignal(10000);
    try {
      const response = await fetch(`${DEHUB_API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: timeout.signal,
      });

      if (!response.ok) {
        // Only a definitive 401 means the refresh token itself is invalid or
        // revoked. Any other non-2xx (500/502/503/429, etc.) is a transient
        // server or network problem, not proof the session is dead — treating
        // it the same as a 401 would silently log the user out on a blip.
        if (response.status === 401) {
          console.warn('[Auth] Refresh token rejected (401), clearing session');
          clearAuthSession();
          return { ok: false, reason: 'revoked' };
        }
        console.warn('[Auth] Token refresh failed (non-401, treating as transient):', response.status);
        return { ok: false, reason: 'transient' };
      }

      const data = await response.json();
      if (!data.accessToken) {
        console.warn('[Auth] Refresh returned 2xx with no access token');
        return { ok: false, reason: 'malformed' };
      }

      setAuthToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      if (data.expiresIn) setTokenExpiresAt(data.expiresIn);

      try {
        window.dispatchEvent(new CustomEvent('dehub:token-refreshed', { detail: { wasExpired } }));
      } catch { /* SSR / test env — no window */ }

      return { ok: true, tokens: data as TokenRefreshResult };
    } catch (e) {
      // AbortError (the 10s timeout above), TypeError (offline, DNS, CORS) —
      // none of these are evidence that the refresh token is invalid.
      console.error('[Auth] Token refresh network error:', e);
      return { ok: false, reason: 'transient' };
    } finally {
      timeout.cancel();
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Back-compat wrapper returning tokens-or-null.
 *
 * Prefer refreshTokenSharedDetailed() anywhere the caller decides whether to
 * end the session: this signature collapses "the server revoked you" and
 * "your train went into a tunnel" into the same `null`, and cannot express
 * "try again later".
 */
export async function refreshTokenShared(): Promise<TokenRefreshResult | null> {
  const outcome = await refreshTokenSharedDetailed();
  return outcome.ok ? outcome.tokens : null;
}

/**
 * Ensure a usable access token exists before making an authenticated request.
 *
 * Throws AuthenticationError only when the session is genuinely unrecoverable.
 * A transient failure throws a plain Error instead, so the UI shows a
 * connection problem rather than falsely telling the user to sign in again.
 */
export async function ensureFreshToken(): Promise<string> {
  const existing = getAuthToken();
  if (existing && !isTokenExpired()) return existing;

  const outcome = await refreshTokenSharedDetailed();
  if (outcome.ok) return outcome.tokens.accessToken;

  if (outcome.reason === 'transient' || outcome.reason === 'malformed') {
    throw new Error('Could not verify your session — please check your connection and try again.');
  }
  throw new AuthenticationError('Session expired. Please sign in again.');
}

// Base API call function - calls DeHub API directly.
//
// `endpoint` resolves against the bare origin, so it must include the `/api`
// prefix. Mobile's axios client sets a base URL ending in `/api` and therefore
// writes paths without it; copying one of those strings across verbatim
// produces a URL that 404s on every call, which surfaces as a generic "failed
// to load" toast rather than anything pointing at the path.
export async function apiCall<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: Record<string, unknown>;
    params?: Record<string, string | number | undefined>;
    requiresAuth?: boolean;
    _retry?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", body, params = {}, requiresAuth = false, _retry = false } = options;

  const url = new URL(endpoint, DEHUB_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  let token = getAuthToken();

  // For an endpoint that requires auth, establish a valid session up front
  // rather than spending a guaranteed-401 round trip on a token we already
  // know is dead. Failing here throws AuthenticationError (not a plain
  // Error), so callers can offer re-auth instead of showing a dead-end
  // "Authentication required" toast that the user can only escape by
  // manually signing out and back in.
  if (requiresAuth && (!token || isTokenExpired())) {
    token = await ensureFreshToken();
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    const errorMessage = (errorData.message || errorData.error || '').toLowerCase();

    // Attempt a refresh on ANY 401, not just ones whose body happens to say
    // "access token expired".
    //
    // Matching that exact phrase made the entire recovery path depend on the
    // server's error wording: a 401 saying "Unauthorized", a bodyless 401 from
    // a CDN or proxy, or any rephrasing on the API side silently disabled
    // refresh-and-retry, and the user got signed out for no reason. A refresh
    // attempt on a non-expiry 401 costs one request and then fails closed
    // below, so the broad trigger is the safe direction to err in.
    const shouldTryRefresh = response.status === 401 && !!getRefreshToken();

    // Skip if: already retried, or this IS the refresh endpoint.
    if (shouldTryRefresh && !_retry && !endpoint.includes('/api/auth/refresh')) {
      // refreshTokenShared() is single-flight — a concurrent call from here
      // and one from auth.ts's refreshAccessToken() (or another apiCall 401)
      // all await the same in-flight request instead of racing.
      const outcome = await refreshTokenSharedDetailed();

      if (outcome.ok) {
        // Retry the original request with the new token and _retry flag
        return apiCall<T>(endpoint, { ...options, _retry: true });
      }

      // A refresh that failed on a network blip must not masquerade as an
      // expired session — that wording pushes the user to sign out and back
      // in when simply retrying would have worked.
      if (outcome.reason === 'transient' || outcome.reason === 'malformed') {
        throw new Error('Could not verify your session — please check your connection and try again.');
      }
      throw new AuthenticationError('Session expired. Please sign in again.');
    }

    // Any 401 or auth-related 403 that isn't a refreshable expiry → throw AuthenticationError
    const isAuthError = 
      response.status === 401 || 
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid token') ||
      errorMessage.includes('token expired') ||
      errorMessage.includes('jwt');

    if (response.status === 401 || (response.status === 403 && isAuthError)) {
      throw new AuthenticationError('Session expired. Please sign in again.');
    }


    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ── Authenticated multipart uploads ──
// FormData bodies cannot go through apiCall() (which JSON-encodes), and
// fetch() cannot report upload progress. Both facts pushed every upload path
// onto a hand-rolled XMLHttpRequest that carried a snapshotted token and had
// no 401 handling — so a post whose token expired during composition failed
// with a bare "HTTP 401" while the rest of the app still looked signed in.
// The helpers below give uploads the same session lifecycle as apiCall().

export interface AuthedUploadOptions {
  method?: "POST" | "PUT" | "PATCH";
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
  /** Unwrap `{ result: … }` envelopes returned by some endpoints. */
  unwrapResult?: boolean;
}

interface XhrOutcome<T> {
  ok: boolean;
  status: number;
  data?: T;
  message?: string;
  /** Machine-readable marker from the error body, e.g. "DAILY_POST_LIMIT". */
  code?: string;
}

function sendAuthedXhr<T>(
  url: string,
  formData: FormData,
  token: string,
  opts: {
    method: string;
    timeoutMs: number;
    unwrapResult: boolean;
    onProgress?: (percent: number) => void;
  },
): Promise<XhrOutcome<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress (bytes sent to server)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          resolve({
            ok: true,
            status: xhr.status,
            data: (opts.unwrapResult ? parsed.result ?? parsed : parsed) as T,
          });
        } catch {
          reject(new Error("Invalid response from server"));
        }
        return;
      }

      let errorData: Record<string, string> = {};
      try { errorData = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      resolve({
        ok: false,
        status: xhr.status,
        message: errorData.message || errorData.error || "Unknown error",
        code: errorData.code,
      });
    };

    xhr.onerror = () => reject(new Error("Upload failed — please check your connection and try again"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — your file may be too large or your connection too slow"));

    xhr.timeout = opts.timeoutMs;
    xhr.open(opts.method, url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

/**
 * Send FormData to an authenticated endpoint, with upload-progress reporting
 * and the same auth lifecycle as apiCall(): refresh a dead token before
 * sending, refresh-and-replay once on a 401, and surface AuthenticationError
 * (not a raw HTTP string) when the session is genuinely unrecoverable.
 */
export async function authedUpload<T>(
  endpoint: string,
  formData: FormData,
  options: AuthedUploadOptions = {},
): Promise<T> {
  const {
    method = "POST",
    onProgress,
    timeoutMs = 8 * 60 * 1000,
    unwrapResult = false,
  } = options;

  const url = new URL(endpoint, DEHUB_API_BASE).toString();
  const xhrOpts = { method, timeoutMs, unwrapResult, onProgress };

  // Refresh up front when the token is already dead, so a large upload is not
  // pushed over the wire with a doomed token and then repeated in full.
  const token = await ensureFreshToken();

  let result = await sendAuthedXhr<T>(url, formData, token, xhrOpts);

  // A 401 here means the token died mid-flight, or the server disagreed with
  // us about its expiry. Refresh once and replay before giving up.
  if (!result.ok && result.status === 401) {
    const outcome = await refreshTokenSharedDetailed();
    if (!outcome.ok) {
      if (outcome.reason === "transient" || outcome.reason === "malformed") {
        throw new Error("Could not verify your session — please check your connection and try again.");
      }
      throw new AuthenticationError("Session expired. Please sign in again.");
    }
    result = await sendAuthedXhr<T>(url, formData, outcome.tokens.accessToken, xhrOpts);
  }

  if (result.ok) return result.data as T;

  const message = (result.message || "").toLowerCase();
  const isAuthError =
    result.status === 401 ||
    message.includes("unauthorized") ||
    message.includes("invalid token") ||
    message.includes("token expired") ||
    message.includes("jwt");

  if (result.status === 401 || (result.status === 403 && isAuthError)) {
    throw new AuthenticationError("Session expired. Please sign in again.");
  }


  throw new Error(`Upload failed (HTTP ${result.status}): ${result.message}`);
}
