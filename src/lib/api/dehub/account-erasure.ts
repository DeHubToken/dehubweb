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
