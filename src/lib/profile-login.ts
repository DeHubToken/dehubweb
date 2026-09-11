import { supabase } from '@/integrations/supabase/client';
import { authenticateWithSupabaseSession } from '@/lib/api/dehub/auth';
import { fetchWallet } from '@/lib/wallet-core/store';

/** Authenticate the profile without reading or opening its wallet. */
export async function authenticateProfileSession(userId: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token || data.session.user.id !== userId) {
    throw new Error('Your sign-in session expired. Please sign in again.');
  }
  // Public address hint for server-verified account-link recovery. A failed
  // wallet lookup cannot prevent the identity's existing profile from opening.
  const wallet = await fetchWallet(userId).catch(() => null);
  return authenticateWithSupabaseSession(data.session.access_token, wallet?.ethAddress);
}
