/**
 * Charge a wallet before running a generation.
 * ============================================
 * Wraps the three things every paid generation endpoint has to do: prove who
 * is calling, price the job here rather than trusting the caller, and confirm
 * the money actually moved before spending a provider credit.
 *
 * There is no balance any more. A job is paid for by a DHB transfer to the
 * treasury, and the caller proves it with a hash that this verifies against
 * the chain. The first job on a hash records the receipt; later jobs draw
 * from what is left of it, which is how voice bills per exchange without
 * asking for a signature between every sentence.
 *
 * `guardPaidEndpoint` — auth plus a per-wallet limit — still comes first: a
 * paid endpoint that skipped it would be the open door the whole module
 * exists to close.
 */

import { guardPaidEndpoint, jsonResponse, serviceClient, type RateLimit } from './auth.ts';
import { quotePriceDhb, type JobKind, type QuoteOptions } from './ai-pricing.ts';
import { claimDhbPayment } from './dhb-transfer.ts';

export interface ChargeRequest extends QuoteOptions {
  kind: JobKind;
  modelId: string;
  /** Rate-limit bucket name, e.g. 'generate-image'. */
  actionType: string;
  rateLimit: RateLimit;
  /**
   * Waive the charge for this job — it runs on our own code rather than a
   * metered provider, so there is nothing to bill for.
   *
   * Auth and the rate limit still apply. The caller owns the promise that a
   * waived job cannot reach a paid provider once it is past this point.
   */
  free?: boolean;
  /**
   * The already-parsed request body, when the caller has one.
   *
   * Required wherever the handler has read the body before charging —
   * generate-video, generate-3d and fal-ai-tools all validate first — because
   * `req.clone()` throws once the body is consumed. generate-image charges
   * before parsing and can leave this out.
   */
  body?: Record<string, unknown>;
}

export type ChargeResult =
  | {
      ok: true;
      wallet: string;
      priceDhb: number;
      jobId: string;
      /**
       * Put the price back on the receipt. Call this when the provider fails
       * after the draw, so the same transfer pays for the retry instead of
       * the user paying twice for one result. Idempotent on jobId.
       */
      refund: () => Promise<void>;
    }
  | { ok: false; response: Response };

export async function chargeForJob(req: Request, opts: ChargeRequest): Promise<ChargeResult> {
  const guard = await guardPaidEndpoint(req, opts.actionType, opts.rateLimit);
  if (!guard.ok) return guard;

  if (opts.free) {
    console.log('[ai-payment] free job, no charge', { kind: opts.kind, modelId: opts.modelId, wallet: guard.wallet });
    return {
      ok: true,
      wallet: guard.wallet,
      priceDhb: 0,
      jobId: crypto.randomUUID(),
      // Nothing was taken, so there is nothing to give back. Kept as a no-op so
      // callers can refund unconditionally on failure without checking price.
      refund: async () => {},
    };
  }

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

  // The hash rides on the same body the handler reads. A caller that has
  // already parsed it hands it over; otherwise cloning leaves the original
  // readable, so nothing downstream had to learn about payment.
  const body = (opts.body
    ?? await req.clone().json().catch(() => ({}))) as { txHash?: unknown; purpose?: unknown };
  const txHash = typeof body.txHash === 'string' ? body.txHash.toLowerCase() : '';

  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'This generation costs DHB. Pay for it and pass the transfer hash.', code: 'PAYMENT_REQUIRED', priceDhb },
        402,
      ),
    };
  }

  const supabase = serviceClient();
  const jobId = crypto.randomUUID();

  const { data: existing } = await supabase
    .from('ai_payments')
    .select('id, wallet_address')
    .eq('tx_hash', txHash)
    .maybeSingle();

  if (existing) {
    // A receipt belongs to the wallet that sent the transfer. Someone else's
    // hash is not a payment, it is a theft attempt.
    if (String(existing.wallet_address).toLowerCase() !== guard.wallet) {
      return { ok: false, response: jsonResponse({ error: 'That payment belongs to another wallet.' }, 403) };
    }
  } else {
    // First job on this hash. The chain is the authority — a caller claiming
    // to have paid proves it, and everything unconfirmable is refused.
    const payment = await claimDhbPayment(txHash, guard.wallet, priceDhb, 'ai', supabase);
    if (!payment.ok) {
      return {
        ok: false,
        response: jsonResponse({ error: payment.reason, code: 'PAYMENT_UNVERIFIED', priceDhb }, 402),
      };
    }

    const { error: insertError } = await supabase.from('ai_payments').insert({
      wallet_address: guard.wallet,
      tx_hash: payment.hash.toLowerCase(),
      chain: payment.chain,
      // The whole transfer, not just this job's price: an overpayment stays
      // the payer's to spend on the next job rather than being kept.
      paid_dhb: payment.dhb,
      remaining_dhb: payment.dhb,
      purpose: body.purpose === 'voice' ? 'voice' : 'job',
    });

    // A unique violation here means the same hash arrived twice at once. The
    // draw below is the arbiter either way, so fall through to it rather than
    // refusing a payment that is on chain and unspent.
    if (insertError && !String(insertError.message || '').includes('duplicate')) {
      console.error('[ai-payment] could not record receipt:', insertError);
      return { ok: false, response: jsonResponse({ error: 'That payment could not be recorded. Nothing has been charged.' }, 500) };
    }
  }

  const { error } = await supabase.rpc('ai_payment_spend', {
    p_tx_hash: txHash,
    p_wallet: guard.wallet,
    p_dhb: priceDhb,
  });

  if (error) {
    const message = String(error.message || '');
    if (message.includes('PAYMENT_EXHAUSTED')) {
      return {
        ok: false,
        response: jsonResponse(
          { error: 'That payment has already been used up. Pay for this generation to run it.', code: 'PAYMENT_EXHAUSTED', priceDhb },
          402,
        ),
      };
    }
    if (message.includes('PAYMENT_NOT_FOUND')) {
      return {
        ok: false,
        response: jsonResponse({ error: 'That payment could not be found.', code: 'PAYMENT_REQUIRED', priceDhb }, 402),
      };
    }
    console.error('[ai-payment] draw failed:', error);
    return { ok: false, response: jsonResponse({ error: 'Could not take payment.' }, 500) };
  }

  return {
    ok: true,
    wallet: guard.wallet,
    priceDhb,
    jobId,
    refund: async () => {
      const { error: refundError } = await supabase.rpc('ai_payment_release', {
        p_tx_hash: txHash,
        p_wallet: guard.wallet,
        p_dhb: priceDhb,
        p_job_id: jobId,
      });
      // A failed release must not mask the provider error that triggered it.
      if (refundError && !String(refundError.message || '').includes('REFUND_ALREADY_APPLIED')) {
        console.error(`[ai-payment] release failed for job ${jobId}:`, refundError);
      }
    },
  };
}
