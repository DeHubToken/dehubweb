/**
 * Charge a wallet before running a generation.
 * ============================================
 * Wraps the three things every paid generation endpoint has to do and none of
 * them were doing: prove who is calling, price the job here rather than
 * trusting the caller, and take the money before spending a provider credit.
 *
 * Before this, all four generation functions ran on `rateLimitByIp` alone with
 * `verify_jwt = false`, so they were open to anyone at 10-30 jobs an hour per
 * IP. The DHB transfer happened in the paywall modal and was never checked, so
 * calling the function directly skipped payment entirely.
 *
 * `guardPaidEndpoint` — auth plus a per-wallet limit — already existed in
 * _shared/auth.ts and had no callers. It does now.
 */

import { guardPaidEndpoint, jsonResponse, serviceClient, type RateLimit } from './auth.ts';
import { quotePriceDhb, type JobKind, type QuoteOptions } from './ai-pricing.ts';

export interface ChargeRequest extends QuoteOptions {
  kind: JobKind;
  modelId: string;
  /** Rate-limit bucket name, e.g. 'generate-image'. */
  actionType: string;
  rateLimit: RateLimit;
}

export type ChargeResult =
  | {
      ok: true;
      wallet: string;
      priceDhb: number;
      jobId: string;
      /**
       * Give the money back. Call this when the provider fails after the debit.
       * Idempotent on jobId, so a retried error path cannot pay out twice.
       */
      refund: () => Promise<void>;
    }
  | { ok: false; response: Response };

export async function chargeForJob(req: Request, opts: ChargeRequest): Promise<ChargeResult> {
  const guard = await guardPaidEndpoint(req, opts.actionType, opts.rateLimit);
  if (!guard.ok) return guard;

  const priceDhb = quotePriceDhb(opts.kind, opts.modelId, {
    durationSeconds: opts.durationSeconds,
    quality: opts.quality,
    quantity: opts.quantity,
  });

  if (priceDhb === null) {
    return {
      ok: false,
      response: jsonResponse({ error: `Unknown model: ${opts.kind}/${opts.modelId}` }, 400),
    };
  }

  const jobId = crypto.randomUUID();
  const supabase = serviceClient();

  const { error } = await supabase.rpc('ai_credit_spend', {
    p_wallet: guard.wallet,
    p_dhb: priceDhb,
    p_model_id: opts.modelId,
    p_ref: jobId,
    p_metadata: { kind: opts.kind, quantity: opts.quantity ?? 1 },
  });

  if (error) {
    if (String(error.message || '').includes('INSUFFICIENT_CREDITS')) {
      return {
        ok: false,
        response: jsonResponse(
          { error: 'Not enough DHB credit for this generation.', code: 'INSUFFICIENT_CREDITS', priceDhb },
          402,
        ),
      };
    }
    console.error('[ai-credit-guard] spend failed:', error);
    return { ok: false, response: jsonResponse({ error: 'Could not charge credit.' }, 500) };
  }

  return {
    ok: true,
    wallet: guard.wallet,
    priceDhb,
    jobId,
    refund: async () => {
      const { error: refundError } = await supabase.rpc('ai_credit_refund', {
        p_wallet: guard.wallet,
        p_dhb: priceDhb,
        p_ref: jobId,
      });
      // A failed refund must not mask the provider error that triggered it.
      if (refundError && !String(refundError.message || '').includes('CREDIT_ALREADY_APPLIED')) {
        console.error(`[ai-credit-guard] refund failed for job ${jobId}:`, refundError);
      }
    },
  };
}
