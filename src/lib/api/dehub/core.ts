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

let refreshInFlight: Promise<TokenRefreshResult | null> | null = null;

/**
 * Refresh the access token using the stored refresh token. Concurrent callers
 * (from this file or auth.ts) share the same in-flight request instead of
 * each firing their own. Updates localStorage on success.
 */
export async function refreshTokenShared(): Promise<TokenRefreshResult | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  // Captured BEFORE the refresh: whether the old access token was already dead.
  // Any API fetch made in that window went out effectively anonymous, so
  // per-user flags (isLiked, isSaved, isUnlocked…) cached from it are wrong for
  // this user. Listeners (AuthProvider) use this to refetch those caches.
  const wasExpired = isTokenExpired() || !getAuthToken();

  refreshInFlight = (async (): Promise<TokenRefreshResult | null> => {
    try {
      const response = await fetch(`${DEHUB_API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        // Without a timeout, a stalled request never settles, and the
        // single-flight promise above never resolves — every subsequent
        // caller awaiting it (or gated behind isRefreshing) hangs forever,
        // requiring a full page reload to recover.
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // Only a definitive 401 means the refresh token itself is invalid or
        // revoked. Any other non-2xx (500/502/503/429, etc.) is a transient
        // server or network problem, not proof the session is dead — treating
        // it the same as a 401 would silently log the user out on a blip.
        if (response.status === 401) {
          console.warn('[Auth] Refresh token rejected (401), clearing session');
          clearAuthSession();
        } else {
          console.warn('[Auth] Token refresh failed (non-401, treating as transient):', response.status);
        }
        return null;
      }

      const data = await response.json();
      if (!data.accessToken) return null;

      setAuthToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      if (data.expiresIn) setTokenExpiresAt(data.expiresIn);

      try {
        window.dispatchEvent(new CustomEvent('dehub:token-refreshed', { detail: { wasExpired } }));
      } catch { /* SSR / test env — no window */ }

      return data as TokenRefreshResult;
    } catch (e) {
      console.error('[Auth] Token refresh network error:', e);
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

// Base API call function - calls DeHub API directly
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

  const token = getAuthToken();

  if (requiresAuth && !token) {
    throw new Error("Authentication required");
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
    
    // Only attempt refresh on explicit "access token expired" 401s
    const isExpiredToken =
      response.status === 401 &&
      errorMessage.includes('access token expired');

    // Auto-retry on expired token using refresh token
    // Skip if: already retried, refresh endpoint itself, or not an expiry error
    if (isExpiredToken && !_retry && !endpoint.includes('/api/auth/refresh')) {
      // refreshTokenShared() is single-flight — a concurrent call from here
      // and one from auth.ts's refreshAccessToken() (or another apiCall 401)
      // all await the same in-flight request instead of racing.
      const refreshed = await refreshTokenShared();

      if (refreshed) {
        // Retry the original request with the new token and _retry flag
        return apiCall<T>(endpoint, { ...options, _retry: true });
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
