/**
 * Legacy-account detection for the wallet-create step.
 * =====================================================
 * Two independent signals, so a returning user is routed to the Migrate tab
 * instead of accidentally creating a fresh wallet:
 *
 * 1. checkLegacyAccount() — asks the `legacy-account-check` edge function
 *    whether the verified email on the CURRENT Supabase session belongs to a
 *    pre-migration DeHub account (and which provider it signed up with).
 *    The email is taken from the session JWT server-side — it is never a
 *    caller-supplied parameter, so this is not an email-enumeration oracle.
 *    Degrades to { exists: null } (= unknown) if the function or its
 *    backend lookup isn't deployed yet.
 *
 * 2. hasLegacyBrowserResidue() — the old Web3Auth stack persisted state on
 *    this same origin (openlogin/torus/tkey/auth_store keys). If any of it
 *    is still in storage, this browser almost certainly signed in to the old
 *    DeHub — even if the user is now trying a different email.
 */
import { supabase } from '@/integrations/supabase/client';

export interface LegacyAccountHint {
  /** true = old account found; false = none for this email; null = unknown (check unavailable). */
  exists: boolean | null;
  /** Provider the old account signed up with ('google' | 'apple' | 'twitter' | 'discord' | 'email' | 'wallet' | 'github'). */
  signupMethod?: string;
  /** The verified email that was checked (for prefilling the migrate email field). */
  email?: string;
}

// Storage key fragments the OLD Web3Auth/Torus stack left behind. Keep in
// sync with clearLegacyStorage() in lib/legacy-web3auth.ts. Our own keys are
// prefixed `dehub_` and excluded.
const LEGACY_STORAGE_MARKERS = ['torus', 'web3auth', 'tkey', 'openlogin', 'auth_store'];
const OWN_PREFIX = 'dehub_';

export function hasLegacyBrowserResidue(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key) continue;
        const lk = key.toLowerCase();
        if (lk.startsWith(OWN_PREFIX)) continue;
        if (LEGACY_STORAGE_MARKERS.some((m) => lk.includes(m))) return true;
      }
    }
  } catch {
    /* storage unavailable (private mode etc.) */
  }
  return false;
}

/**
 * Ask the backend whether the current session's verified email has a
 * pre-migration account. Never throws; unknown → { exists: null } so the
 * caller can fall back to default behaviour.
 */
export async function checkLegacyAccount(): Promise<LegacyAccountHint> {
  try {
    const { data, error } = await supabase.functions.invoke('legacy-account-check');
    if (error || !data || typeof data.exists !== 'boolean') return { exists: null };
    return {
      exists: data.exists,
      signupMethod: typeof data.signupMethod === 'string' ? data.signupMethod : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
    };
  } catch {
    return { exists: null };
  }
}
