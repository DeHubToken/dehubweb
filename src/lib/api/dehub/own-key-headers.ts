import { getAuthToken } from '@/lib/api/dehub/core';

/**
 * Lets an AI tool see who is asking, so it can run on the creator's own
 * provider key when they saved one in Settings. Signed out = no header and the
 * tool runs exactly as before.
 */
export function ownKeyHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { 'x-dehub-token': token } : {};
}
