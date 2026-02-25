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
  if (relativePath.startsWith("data:")) {
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

// Token expiry duration in milliseconds (24 hours)
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem("dehub_token", token);
    localStorage.setItem("dehub_token_timestamp", String(Date.now()));
  } else {
    localStorage.removeItem("dehub_token");
    localStorage.removeItem("dehub_token_timestamp");
  }
};

/**
 * Get the current auth token from localStorage.
 * Always reads fresh from localStorage to avoid stale token issues.
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem("dehub_token");
};

export const isTokenExpired = (): boolean => {
  const timestamp = localStorage.getItem("dehub_token_timestamp");
  if (!timestamp) return true;
  
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  return tokenAge >= TOKEN_EXPIRY_MS;
};

export const clearAuthSession = () => {
  localStorage.removeItem("dehub_token");
  localStorage.removeItem("dehub_token_timestamp");
  localStorage.removeItem("dehub_wallet");
};

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

    if ((response.status === 403 && isAuthError) || response.status === 401) {
      // Don't clear auth session here — let the useReauthHandler attempt
      // a silent re-sign first. Only clear on explicit disconnect.
      throw new AuthenticationError('Session expired. Please sign in again.');
    }
    
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}
