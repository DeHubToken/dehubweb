/**
 * Kids Mode — the account flag and the PIN that leaves it.
 *
 * Its own routes rather than fields on the profile update: the profile PATCH
 * is a multipart form that also carries avatars, and a 403 for a wrong PIN
 * does not belong in the same response as "display name saved".
 *
 * Nothing here ever returns the PIN or its hash — `getKidsMode` answers one
 * boolean.
 *
 * @module lib/api/dehub/kids-mode
 */

import { apiCall } from './core';

export interface KidsModeStatus {
  enabled: boolean;
}

/** Whether Kids Mode is on for the signed-in account. */
export async function getKidsMode(): Promise<KidsModeStatus> {
  const response = await apiCall<{ status: boolean; result: KidsModeStatus }>('/api/kids-mode', {
    requiresAuth: true,
  });
  return response?.result ?? { enabled: false };
}

/**
 * Turn Kids Mode on and set the PIN that turns it off.
 *
 * Refused by the server when Kids Mode is already on — changing the PIN means
 * turning it off with the current one first, or re-arming would be a way to
 * replace a PIN without knowing it.
 */
export async function enableKidsMode(pin: string): Promise<KidsModeStatus> {
  const response = await apiCall<{ status: boolean; result: KidsModeStatus }>('/api/kids-mode/enable', {
    method: 'POST',
    body: { pin },
    requiresAuth: true,
  });
  return response?.result ?? { enabled: true };
}

/**
 * Turn Kids Mode off with the PIN.
 *
 * Five wrong PINs lock the pad for fifteen minutes, server-side and on the
 * account, so the lock survives a reload and a different browser.
 */
export async function disableKidsMode(pin: string): Promise<KidsModeStatus> {
  const response = await apiCall<{ status: boolean; result: KidsModeStatus }>('/api/kids-mode/disable', {
    method: 'POST',
    body: { pin },
    requiresAuth: true,
  });
  return response?.result ?? { enabled: false };
}
