/**
 * Active session management.
 *
 * Ported from mobile's `services/session.service.ts` so both clients drive the
 * same `/auth/sessions` endpoints — a session revoked on one client disappears
 * on the other. The shapes below intentionally match mobile's `Session`
 * interface field-for-field; do not diverge them without changing both.
 */
import { apiCall, getRefreshToken } from './core';

export interface Session {
  deviceId: string;
  deviceName: string | null;
  platform: 'ios' | 'android' | 'web';
  appVersion: string | null;
  osVersion: string | null;
  ip: string | null;
  lastActiveAt: string;
  createdAt: string;
  current: boolean;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await apiCall<{ status: boolean; sessions: Session[] }>('/auth/sessions', {
    requiresAuth: true,
  });
  return res?.sessions ?? [];
}

export async function revokeSession(deviceId: string): Promise<void> {
  await apiCall(`/auth/sessions/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

/**
 * Revokes every session except the one making the call. The server identifies
 * "this" session by the refresh token, so it has to be sent explicitly —
 * the access token alone is not enough to keep the current device signed in.
 */
export async function revokeOtherSessions(): Promise<number> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');
  const res = await apiCall<{ status: boolean; revokedCount: number }>(
    '/auth/sessions/revoke-others',
    {
      method: 'POST',
      body: { refreshToken },
      requiresAuth: true,
    },
  );
  return res?.revokedCount ?? 0;
}
