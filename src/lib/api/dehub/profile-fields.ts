/**
 * Profile fields API
 * ==================
 * Up to four label/value lines on a profile (dehub-stream-backend
 * src/profile-fields). Saving checks every https link for a rel="me" back to
 * the profile and answers with `verifiedAt` on the ones that have it.
 *
 * @module lib/api/dehub/profile-fields
 */
import { apiCall } from './core';
import { translateCopy as _translateCopy } from '@/i18n/copy';

export type ProfileField = { name: string; value: string; verifiedAt?: string | null };

export async function saveProfileFields(fields: Array<{ name: string; value: string }>): Promise<ProfileField[]> {
  const response = await apiCall<any>('/api/profile-fields', { method: 'PUT', body: { fields }, requiresAuth: true });
  if (response && response.status === false) throw new Error(response.error || _translateCopy("copy.cfce761befa8", { defaultValue: "Request failed" }));
  const list = response?.result ?? response;
  return Array.isArray(list) ? list : [];
}
