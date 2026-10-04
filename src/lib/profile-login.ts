import { supabase } from '@/integrations/supabase/client';
import { authenticateWithSupabaseSession } from '@/lib/api/dehub/auth';
import { fetchWallet } from '@/lib/wallet-core/store';
import { createLogger } from './logger';

const log = createLogger('ProfileLogin');

/**
 * This browser holds no live Supabase session for the profile, so there is
 * nothing to exchange. On a page-load restore that is expected once the
 * Supabase session lapses; the DeHub token carries the sign-in from there.
 */
export class SupabaseSessionMissingError extends Error {
  constructor() {
    super('Your sign-in session expired. Please sign in again.');
    this.name = 'SupabaseSessionMissingError';
  }
}

/** Authenticate the profile without reading or opening its wallet. */
export async function authenticateProfileSession(userId: string) {
  log.trace?.('identity-session-check');
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token || data.session.user.id !== userId) {
    throw new SupabaseSessionMissingError();
  }
  // Public address hint for server-verified account-link recovery. A failed
  // wallet lookup cannot prevent the identity's existing profile from opening.
  const wallet = await fetchWallet(userId).catch(() => null);
  log.trace?.('profile-exchange-start', { has_wallet_row: !!wallet });
  return authenticateWithSupabaseSession(data.session.access_token, wallet?.ethAddress);
}
