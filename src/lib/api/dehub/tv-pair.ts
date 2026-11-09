import { apiCall } from './core';

/**
 * Signing a television in from the browser: the same two calls the phone app's
 * Settings → Privacy → Sign in a TV makes (dehub-mobile services/tvPairing).
 *
 * The TV shows an eight-character code. `lookup` names the device behind it so
 * the person can check it is the television in front of them before `approve`
 * hands it a session. The approving account always comes from this browser's
 * own token, never from anything typed here.
 */

export interface TvPairingTarget {
  deviceName: string;
  expiresAt?: string;
}

/** "wxyz42k8", "WXYZ 42K8" and "WXYZ-42K8" are all the same code. */
export function normalisePairingCode(raw: string): string {
  const bare = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return bare.length > 4 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export function isCompletePairingCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

/** The device behind a code; null when the code is wrong, expired or used. */
export async function lookupTvPairing(code: string): Promise<TvPairingTarget | null> {
  try {
    const res = await apiCall<{ deviceName?: string; expiresAt?: string }>('/tv/pair/lookup', {
      params: { code },
      requiresAuth: true,
    });
    return res?.deviceName ? { deviceName: res.deviceName, expiresAt: res.expiresAt } : null;
  } catch (error) {
    const status = (error as { httpStatus?: number })?.httpStatus;
    if (status && status < 500) return null;
    throw error;
  }
}

export async function resolveTvPairing(code: string, approve: boolean): Promise<void> {
  await apiCall('/tv/pair/approve', {
    method: 'POST',
    body: approve ? { code } : { code, reject: true },
    requiresAuth: true,
  });
}
