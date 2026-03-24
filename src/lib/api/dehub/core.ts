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
  return `${DEHUB_CDN_BASE}${relativePath}`;
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
};

// ── 401 Auto-Retry with Refresh Token ──

type QueueEntry = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

let isRefreshing = false;
let failedQueue: QueueEntry[] = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(undefined); // signal retry
    }
  });
  failedQueue = [];
};

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Updates localStorage on success. Returns true if refresh succeeded.
 * This is a standalone fetch (not apiCall) to avoid recursion.
 */
async function attemptTokenRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      // Refresh token invalid/reused — server revoked all tokens
      console.warn('[Auth] Refresh token rejected, clearing session');
      clearAuthSession();
      return false;
    }

    const data = await response.json();
    // Server returns { accessToken, refreshToken, expiresIn }
    if (data.accessToken) {
      setAuthToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      if (data.expiresIn) setTokenExpiresAt(data.expiresIn);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[Auth] Token refresh network error:', e);
    return false;
  }
}

// Base API call function - calls DeHub API directly
export async function apiCall<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: Record<string, unknown>;
    params?: Record<string, string | number | undefined>;
    requiresAuth?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", body, params = {}, requiresAuth = false } = options;

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
    const isAuthError = 
      response.status === 401 || 
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid token') ||
      errorMessage.includes('token expired') ||
      errorMessage.includes('jwt');

    // Auto-retry on 401 using refresh token (skip for the refresh endpoint itself)
    if ((response.status === 401 || (response.status === 403 && isAuthError)) &&
        !endpoint.includes('/auth/refresh')) {
      
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshed = await attemptTokenRefresh();
        isRefreshing = false;

        if (refreshed) {
          processQueue(null);
          // Retry the original request with the new token
          return apiCall<T>(endpoint, options);
        } else {
          const authErr = new AuthenticationError('Session expired. Please sign in again.');
          processQueue(authErr);
          throw authErr;
        }
      } else {
        // Another refresh is in progress — queue this request
        return new Promise<T>((resolve, reject) => {
          failedQueue.push({
            resolve: () => resolve(apiCall<T>(endpoint, options)),
            reject,
          });
        });
      }
    }

    if ((response.status === 403 && isAuthError) || response.status === 401) {
      throw new AuthenticationError('Session expired. Please sign in again.');
    }
    
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}
