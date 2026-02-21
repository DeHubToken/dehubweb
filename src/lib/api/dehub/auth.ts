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
  const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      address: address.toLowerCase(),
      sig: signature,
      timestamp,
      chainId,
    }),
  });

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
