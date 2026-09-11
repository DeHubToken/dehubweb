import { supabase } from '@/integrations/supabase/client';
import { authenticateWithSupabaseSession } from '@/lib/api/dehub/auth';

/** Authenticate the profile without reading or opening its wallet. */
export async function authenticateProfileSession(userId: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token || data.session.user.id !== userId) {
    throw new Error('Your sign-in session expired. Please sign in again.');
  }
  return authenticateWithSupabaseSession(data.session.access_token);
}
