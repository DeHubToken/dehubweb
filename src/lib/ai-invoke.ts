/**
 * Authenticated calls to the paid AI functions.
 * =============================================
 * generate-image, generate-video, generate-3d and fal-ai-tools charge live
 * DHB per job, which means they need to know who is calling. They read the
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
import { forgetPayment } from '@/lib/ai-payment';

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
export async function invokeAi<T = any>(
  name: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  const result = await supabase.functions.invoke<T>(name, {
    ...options,
    headers: { ...dehubAuthHeaders(), ...options.headers },
  });

  // Retire what this call drew from the payment. It happens here rather than
  // in a paywall because a paywall hands over before the job runs and never
  // learns whether its hash was accepted.
  //
  // A job that succeeds draws its own price, not the whole transfer — the
  // server keeps the rest as the payer's — so `forgetPayment` debits rather
  // than deleting. Exhausted is the one case where the balance really is gone,
  // and it says so.
  //
  // A voice session is the exception — one transfer buys a block of exchanges
  // and has to survive them — so it says so and keeps its hash.
  const body = options.body as { txHash?: unknown; purpose?: unknown } | undefined;
  if (typeof body?.txHash === 'string' && body.purpose !== 'voice') {
    const exhausted = !!result.error
      && isPaymentExhausted(await readFunctionError(result.error, result.data));
    if (!result.error || exhausted) forgetPayment(body.txHash, exhausted);
  }

  return result;
}

function isPaymentExhausted(message: string): boolean {
  return message.includes('PAYMENT_EXHAUSTED') || message.includes('already been used');
}

/**
 * True when a call was refused over payment rather than a broken request, so
 * callers can send the user back to the paywall instead of showing a generic
 * error.
 */
export function isPaymentRequired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('PAYMENT_REQUIRED')
    || message.includes('PAYMENT_EXHAUSTED')
    || message.includes('PAYMENT_UNVERIFIED')
    || message.includes('costs DHB');
}

/**
 * The reason a paid AI function actually rejected a call.
 *
 * `supabase.functions.invoke` does NOT populate `data` on a non-2xx: it returns
 * `data: null` plus a FunctionsHttpError whose message is the fixed string
 * "Edge Function returned a non-2xx status code". Our functions answer with a
 * useful `{ error }` body — "Not enough DHB credit", "not found on-chain",
 * a rate-limit notice — and every one of those was being thrown away, so the
 * user saw the generic wrapper and a developer had no way to tell a payment
 * problem from an indexing lag.
 *
 * The body is still readable through `error.context`, which is the raw
 * `Response`. Reading it is the only way to recover the reason, and it can be
 * read exactly once, so this is the single place that does it.
 */
export async function readFunctionError(error: unknown, data?: unknown): Promise<string> {
  // A 2xx that carries `{ error }` in the body — the functions do this for
  // soft failures like a safety block — is already readable.
  const inline = (data as { error?: string } | null)?.error;
  if (inline) return inline;

  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      const message = (body as { error?: string })?.error;
      if (message) return message;
    } catch {
      // Not JSON, or already consumed. Fall through to the generic message.
    }
  }

  return error instanceof Error ? error.message : String(error ?? 'Request failed.');
}
