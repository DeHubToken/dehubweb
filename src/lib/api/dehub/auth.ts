import { DEHUB_API_BASE, setAuthToken, setRefreshToken, setTokenExpiresAt, getRefreshToken, getAuthToken, refreshTokenShared, refreshTokenSharedDetailed } from './core';
import type { TokenRefreshOutcome } from './core';
import type { AuthResponse } from './types';
import { deviceHeaders } from '@/lib/device-id';

export interface UsernameCheckResponse {
  status: boolean;
  code: number;
  available: boolean;
  username: string;
  message?: string;
  error?: boolean;
}

/** The API's code for a wallet signup turned away by the on-chain history gate. */
export const WALLET_SIGNUP_BLOCKED_CODE = 'WALLET_SIGNUP_REQUIRES_HISTORY';

/**
 * Thrown when a brand-new account is refused because the wallet has no history
 * on any supported chain — the anti-bot gate the API added in stream-backend
 * #128. Signing again cannot fix it, and neither can waiting: the person has to
 * either fund the wallet or come in through Google/Apple/email/phone.
 *
 * It is a distinct type because the generic path tells the user to "try again",
 * which is the one piece of advice guaranteed not to work here, and because it
 * drops the API's own explanation — the only place the alternatives are named.
 */
export class WalletSignupBlockedError extends Error {
  constructor(
    message = 'To create an account with a wallet, that wallet needs some history on-chain — a balance, or a transaction it has sent before.',
  ) {
    super(message);
    this.name = 'WalletSignupBlockedError';
  }
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
    // The server records the device only at login, so these have to be here
    // rather than on the shared request helper.
    ...deviceHeaders(),
  };

  // DeHub API only exposes /api/web/auth (doc.md). /api/auth returns 404.
  const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.code === WALLET_SIGNUP_BLOCKED_CODE) {
      throw new WalletSignupBlockedError(errorData.message || errorData.error_message);
    }
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
 * Thrown when the backend has no wallet linked to this Supabase identity yet.
 * The caller must fall back to the signature flow, which is what creates the
 * link — it is a normal state for a first-ever login, not an error to surface.
 */
export class WalletNotLinkedError extends Error {
  constructor(message = 'No wallet is linked to this login yet.') {
    super(message);
    this.name = 'WalletNotLinkedError';
  }
}

/**
 * Exchange a Supabase access token for a DeHub session, with no wallet
 * signature — so login can finish without unlocking the wallet.
 *
 * The wallet stays encrypted; anything that needs to sign triggers an unlock at
 * that point (see the dehub:wallet-unlock-required flow). Requires the Supabase
 * identity to already be linked, which the signature flow does on first login.
 *
 * @throws WalletNotLinkedError when no link exists yet (HTTP 409)
 */
export async function authenticateWithSupabaseSession(
  supabaseAccessToken: string,
): Promise<AuthResponse> {
  const response = await fetch(`${DEHUB_API_BASE}/api/web/auth/supabase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Sent as a header rather than in the body so it does not land in request
      // logs that record bodies.
      Authorization: `Bearer ${supabaseAccessToken}`,
      ...deviceHeaders(),
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as Record<string, unknown>));
    const code = errorData.code as string | undefined;
    // 409 means "not linked" or "linked ambiguously". Both are resolved by
    // signing once, so both fall back rather than dead-ending the user.
    if (response.status === 409 || code === 'WALLET_NOT_LINKED' || code === 'WALLET_LINK_AMBIGUOUS') {
      throw new WalletNotLinkedError(
        (errorData.message as string) || 'No wallet is linked to this login yet.',
      );
    }
    // 503 (endpoint switched off server-side) is deliberately NOT special-cased
    // here — the caller treats any non-409 failure as "fall back to signing",
    // so a server without SUPABASE_JWT_SECRET simply keeps the old behaviour.
    throw new Error(
      (errorData.message as string) || (errorData.error as string) || 'Authentication failed',
    );
  }

  const data: AuthResponse = await response.json();

  if (data.token) setAuthToken(data.token);
  if (data.refreshToken) setRefreshToken(data.refreshToken);
  if (data.expiresIn) setTokenExpiresAt(data.expiresIn);
  else localStorage.setItem('dehub_token_timestamp', String(Date.now()));

  return data;
}

export interface EmailLinkStatusResponse {
  status: boolean;
  /** True only for a link this flow wrote — the kind that can be removed. */
  linked: boolean;
  /** Masked server-side (us***@example.com) — safe to render as-is. */
  email: string | null;
  /**
   * Whether attaching an email can succeed at all. False for an account whose
   * Supabase identity came from a social signup: it already signs in without a
   * wallet, and confirm would refuse a second link with
   * ACCOUNT_HAS_LOGIN_LINKED. Absent on servers older than that field.
   */
  canLink?: boolean;
  /** 'wallet-email' for a link from this flow, 'other' for a social signup. */
  source?: 'wallet-email' | 'other' | null;
}

/** Whether the signed-in account already carries an email login. */
export async function getEmailLinkStatus(): Promise<EmailLinkStatusResponse> {
  const { apiCall } = await import('./core');
  return apiCall<EmailLinkStatusResponse>('/api/account/email-link/status', {
    requiresAuth: true,
  });
}

/**
 * Mail a 6-digit code that, once confirmed, lets this account sign in with
 * that email — no wallet signature needed on future logins.
 *
 * Errors arrive as thrown Error instances whose message is the server's
 * user-facing copy (cooldowns, rate limits, invalid email), so callers can
 * toast them directly.
 */
export async function requestEmailLinkCode(email: string): Promise<{ status: boolean }> {
  const { apiCall } = await import('./core');
  return apiCall<{ status: boolean }>('/api/account/email-link/request', {
    method: 'POST',
    body: { email },
    requiresAuth: true,
  });
}

/**
 * Verify the code and attach the email as a login route for this account.
 *
 * Refusals are 409s with a `code` in the body (EMAIL_IN_USE,
 * EMAIL_ALREADY_LINKED, ACCOUNT_HAS_LOGIN_LINKED); apiCall flattens those to
 * Error(message), which is all the UI needs to show.
 */
export async function confirmEmailLink(
  email: string,
  code: string,
): Promise<{ status: boolean; linked: boolean; email: string | null }> {
  const { apiCall } = await import('./core');
  return apiCall<{ status: boolean; linked: boolean; email: string | null }>(
    '/api/account/email-link/confirm',
    {
      method: 'POST',
      body: { email, code },
      requiresAuth: true,
    },
  );
}

/**
 * Detach the email login again, so that address can no longer sign this
 * account in.
 *
 * Only removes a link this flow attached. An account whose Supabase identity
 * came from a social signup is refused with LOGIN_NOT_REMOVABLE — that link is
 * its only way back in.
 */
export async function unlinkEmailLogin(): Promise<{ status: boolean; linked: boolean }> {
  const { apiCall } = await import('./core');
  return apiCall<{ status: boolean; linked: boolean }>('/api/account/email-link', {
    method: 'DELETE',
    requiresAuth: true,
  });
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
 * Same refresh, but reporting *why* it failed.
 *
 * Callers that decide whether to end the session must use this: the null
 * returned above cannot distinguish "the server revoked this token" from
 * "the request timed out", and treating the second as the first is what
 * signs people out mid-session on a flaky connection.
 */
export async function refreshAccessTokenDetailed(): Promise<TokenRefreshOutcome> {
  return refreshTokenSharedDetailed();
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
