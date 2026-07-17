import { DEHUB_API_BASE, setAuthToken, setRefreshToken, setTokenExpiresAt, getRefreshToken, getAuthToken, refreshTokenShared } from './core';
import type { AuthResponse } from './types';

export interface UsernameCheckResponse {
  status: boolean;
  code: number;
  available: boolean;
  username: string;
  message?: string;
  error?: boolean;
}

export interface Web3AuthMeta {
  typeOfLogin?: string;
  verifier?: string;
  verifierId?: string;
  email?: string;
  name?: string;
  profileImage?: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function checkUsernameAvailability(username: string): Promise<UsernameCheckResponse> {
  const { apiCall } = await import('./core');
  return apiCall<UsernameCheckResponse>("/api/username/check", {
    params: { username },
    requiresAuth: false,
  });
}

export async function checkUsernameAvailabilityPost(username: string): Promise<UsernameCheckResponse> {
  const { apiCall } = await import('./core');
  return apiCall<UsernameCheckResponse>("/api/username/check", {
    method: "POST",
    body: { username },
    requiresAuth: false,
  });
}

export async function authenticateWallet(
  address: string,
  signature: string,
  timestamp: number,
  chainId: number = 8453,
  web3AuthMeta?: Web3AuthMeta,
): Promise<AuthResponse> {
  const body: Record<string, any> = {
    address: address.toLowerCase(),
    sig: signature,
    timestamp,
    chainId,
  };

  if (web3AuthMeta) {
    body.web3AuthMeta = web3AuthMeta;
  }

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // DeHub API only exposes /api/web/auth (doc.md). /api/auth returns 404.
  const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Authentication failed");
  }

  const data: AuthResponse = await response.json();

  // Store access token
  if (data.token) {
    setAuthToken(data.token);
  }

  // Store refresh token if provided
  if (data.refreshToken) {
    setRefreshToken(data.refreshToken);
  }

  // Store dynamic expiry if provided (server sends seconds), otherwise fallback to 24h
  if (data.expiresIn) {
    setTokenExpiresAt(data.expiresIn);
  } else {
    // Legacy fallback — store a 24h expiry timestamp
    localStorage.setItem("dehub_token_timestamp", String(Date.now()));
  }

  return data;
}

/**
 * Refresh the access token using the stored refresh token.
 * Returns the new token data, or null if refresh failed.
 *
 * Delegates to core.ts's refreshTokenShared() so this call and any 401-
 * triggered refresh inside apiCall() share the same single-flight request —
 * two independent refreshes racing on the same refresh token can trigger a
 * server's reuse-detection and revoke the whole session.
 */
export async function refreshAccessToken(): Promise<RefreshTokenResponse | null> {
  return refreshTokenShared();
}

/**
 * Revoke the current refresh token on the server (best-effort).
 * Called on explicit logout.
 */
export async function logoutFromServer(): Promise<void> {
  const refreshToken = getRefreshToken();
  const accessToken = getAuthToken();
  if (!refreshToken || !accessToken) return;

  try {
    await fetch(`${DEHUB_API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (e) {
    // Best-effort — don't block logout on network failure
    console.warn('[Auth] Server logout failed (non-blocking):', e);
  }
}

/**
 * Revoke ALL refresh tokens for the current user (best-effort).
 */
export async function logoutAllSessions(): Promise<void> {
  const accessToken = getAuthToken();
  if (!accessToken) return;

  try {
    await fetch(`${DEHUB_API_BASE}/api/auth/logout-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  } catch (e) {
    console.warn('[Auth] Logout all sessions failed (non-blocking):', e);
  }
}
