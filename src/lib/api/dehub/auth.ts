import { DEHUB_API_BASE, setAuthToken } from './core';
import type { AuthResponse } from './types';

export interface UsernameCheckResponse {
  status: boolean;
  code: number;
  available: boolean;
  username: string;
  message?: string;
  error?: boolean;
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
): Promise<AuthResponse> {
  const body = JSON.stringify({
    address: address.toLowerCase(),
    sig: signature,
    timestamp,
    chainId,
  });
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // Try /api/auth first (generates isMobile:true JWT which works with DM socket).
  // Fall back to /api/web/auth if /api/auth doesn't exist.
  let response = await fetch(`${DEHUB_API_BASE}/api/auth`, {
    method: "POST",
    headers,
    body,
  });

  if (response.status === 404 || response.status === 405) {
    response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
      method: "POST",
      headers,
      body,
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Authentication failed");
  }

  const data: AuthResponse = await response.json();

  if (data.token) {
    setAuthToken(data.token);
  }

  return data;
}
