/**
 * Authenticated calls to the paid AI functions.
 * =============================================
 * generate-image, generate-video, generate-3d and fal-ai-tools now charge a
 * DHB balance, which means they need to know who is calling. They read the
 * DeHub token from `x-dehub-token` and the wallet from `x-wallet-address`
 * rather than a Supabase JWT, so `supabase.functions.invoke` has to be handed
 * those headers explicitly.
 *
 * Calling them without the headers gets a 401 rather than a free generation,
 * which is the point — they used to run for anyone at 10-30 jobs an hour per
 * IP with no payment check at all.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub';

/** Headers the paid AI functions authenticate against. Empty when signed out. */
export function dehubAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const wallet = localStorage.getItem('dehub_wallet');
  if (!token || !wallet) return {};
  return {
    'x-wallet-address': wallet.toLowerCase(),
    'x-dehub-token': token,
  };
}

/**
 * `supabase.functions.invoke` with the auth headers attached.
 *
 * Status polling goes through here too. Polls are not charged — the functions
 * return before the debit when a predictionId is present — but they still have
 * to authenticate.
 */
// `T` defaults to `any` to match supabase.functions.invoke exactly. This is a
// drop-in for it at 11 existing call sites, and defaulting to `unknown` would
// make every one of them a type error over data they already destructure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function invokeAi<T = any>(
  name: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  return supabase.functions.invoke<T>(name, {
    ...options,
    headers: { ...dehubAuthHeaders(), ...options.headers },
  });
}

/**
 * True when a failed call was a credit problem rather than a broken request,
 * so callers can send the user to top up instead of showing a generic error.
 */
export function isInsufficientCredit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('INSUFFICIENT_CREDITS') || message.includes('Not enough DHB credit');
}
