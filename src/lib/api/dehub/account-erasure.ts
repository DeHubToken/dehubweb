import { apiCall } from './core';
import { supabase } from '@/integrations/supabase/client';

export async function eraseAccount() {
  const { data } = await supabase.auth.getSession();
  const response = await apiCall<{ status: boolean; result?: { status: string } }>('/api/account/erase', {
    method: 'POST', body: { confirmation: 'DELETE', appleRefreshToken: data.session?.provider_refresh_token || undefined }, requiresAuth: true, timeoutMs: 60000,
  });
  if (!response.status || !response.result) throw new Error('Deletion was not accepted');
  return response.result;
}

/**
 * Deactivate: the reversible one. Hides the profile, posts and comments and
 * signs out every device. Nothing is erased, and signing in again brings it
 * all back (riftn-backend: account-deletion.service.ts, restoreDeletedAccount).
 */
export async function deactivateAccount() {
  const response = await apiCall<{ status: boolean; result?: { deletedAt: string } }>('/api/account/delete', {
    method: 'POST', body: { reason: 'self-deactivated' }, requiresAuth: true, timeoutMs: 30000,
  });
  if (!response.status) throw new Error('Deactivation was not accepted');
  return response.result;
}
