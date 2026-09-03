/**
 * ai-payment-record
 * =================
 * Write down a DHB transfer the moment it is mined, before anything tries to
 * spend it.
 *
 * Until this existed, a receipt was only created inside `chargeForJob` — that
 * is, only if the generation request actually arrived. Everything that could
 * go wrong between signing the transfer and the function receiving it
 * therefore lost the money silently: the client's `wait()` throwing on a flaky
 * connection, the tab closing, the invoke failing, a 401. The DHB was on chain
 * in the treasury and no row anywhere said whose it was.
 *
 * It is not a hypothetical. Between the pay-per-job launch on 2026-08-28 and
 * 2026-09-03 the treasury received four transfers totalling 57 DHB and
 * `ai_payments` held zero rows. Four payments, no jobs, no receipts, nothing
 * to refund from.
 *
 * So the client now calls this as soon as it has a mined hash. The receipt is
 * the same row `chargeForJob` would have written, with the whole transfer
 * still unspent, and `chargeForJob` finds it on its existing-receipt path and
 * simply draws from it. A job that never runs leaves the balance sitting there
 * for the next one instead of evaporating.
 *
 * Two actions:
 *   { txHash }         record a transfer (idempotent on the hash)
 *   { action: 'list' } the caller's receipts that still have DHB on them
 *
 * Both are scoped to the wallet the DeHub token belongs to, never to a wallet
 * the caller names.
 */

import { corsHeaders, guardPaidEndpoint, jsonResponse, serviceClient } from '../_shared/auth.ts';
import { claimDhbPayment } from '../_shared/dhb-transfer.ts';

/**
 * The floor for "this is a real payment".
 *
 * We cannot check the transfer against a price here — no job has been chosen
 * yet, which is the entire point of recording early. `chargeForJob` still
 * prices the job and still refuses to draw more than the receipt holds, so the
 * amount is enforced where it matters. This only rejects dust.
 */
const MIN_RECORDABLE_DHB = 1;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json().catch(() => ({})) as {
    action?: unknown;
    txHash?: unknown;
    purpose?: unknown;
  };

  // Recording is cheap but it does hit an archive RPC, so it is rate limited
  // like any other paid endpoint. The limit is generous: a voice session plus
  // a run of image jobs is a lot of legitimate calls in an hour.
  const guard = await guardPaidEndpoint(req, 'ai-payment-record', { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!guard.ok) return guard.response;

  const supabase = serviceClient();

  if (body.action === 'list') {
    const { data, error } = await supabase
      .from('ai_payments')
      .select('tx_hash, chain, paid_dhb, remaining_dhb, purpose, created_at')
      .eq('wallet_address', guard.wallet)
      .gt('remaining_dhb', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[ai-payment-record] list failed:', error);
      return jsonResponse({ error: 'Could not read your payments.' }, 500);
    }

    return jsonResponse({
      payments: (data ?? []).map((row) => ({
        txHash: row.tx_hash,
        chain: row.chain,
        paidDhb: Number(row.paid_dhb),
        remainingDhb: Number(row.remaining_dhb),
        purpose: row.purpose,
        createdAt: row.created_at,
      })),
    });
  }

  const txHash = typeof body.txHash === 'string' ? body.txHash.toLowerCase() : '';
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return jsonResponse({ error: 'A transfer hash is required.' }, 400);
  }

  // Already recorded is a success, not a conflict — the client calls this on
  // every payment and retries it on the ones it could not confirm.
  const { data: existing } = await supabase
    .from('ai_payments')
    .select('tx_hash, chain, paid_dhb, remaining_dhb, wallet_address')
    .eq('tx_hash', txHash)
    .maybeSingle();

  if (existing) {
    if (String(existing.wallet_address).toLowerCase() !== guard.wallet) {
      return jsonResponse({ error: 'That payment belongs to another wallet.' }, 403);
    }
    return jsonResponse({
      txHash: existing.tx_hash,
      chain: existing.chain,
      paidDhb: Number(existing.paid_dhb),
      remainingDhb: Number(existing.remaining_dhb),
      alreadyRecorded: true,
    });
  }

  const payment = await claimDhbPayment(txHash, guard.wallet, MIN_RECORDABLE_DHB, 'ai', supabase);
  if (!payment.ok) {
    // The usual reason is that the transfer is a few seconds ahead of the
    // indexer. The client keeps the hash and tries again, so this is a retry
    // signal rather than a refusal.
    return jsonResponse({ error: payment.reason, code: 'PAYMENT_UNVERIFIED' }, 402);
  }

  const { error: insertError } = await supabase.from('ai_payments').insert({
    wallet_address: guard.wallet,
    tx_hash: payment.hash.toLowerCase(),
    chain: payment.chain,
    paid_dhb: payment.dhb,
    remaining_dhb: payment.dhb,
    purpose: body.purpose === 'voice' ? 'voice' : 'job',
  });

  // A duplicate means two calls raced. Both wanted the same row and it exists,
  // so both succeeded.
  if (insertError && !String(insertError.message || '').includes('duplicate')) {
    console.error('[ai-payment-record] could not record receipt:', insertError);
    return jsonResponse({ error: 'That payment could not be recorded.' }, 500);
  }

  console.log('[ai-payment-record] recorded', { wallet: guard.wallet, txHash, dhb: payment.dhb });

  return jsonResponse({
    txHash: payment.hash.toLowerCase(),
    chain: payment.chain,
    paidDhb: payment.dhb,
    remainingDhb: payment.dhb,
  });
});
