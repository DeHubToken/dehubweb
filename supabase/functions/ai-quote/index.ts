/**
 * ai-quote
 * ========
 * What a generation costs, priced here rather than on the client.
 *
 * This is all that survives of `ai-credits`. Balance, top-up and the free
 * starter/daily claim are gone with the ledger: there is no balance to read
 * and nothing to grant, because a job is paid for by a DHB transfer that the
 * generation endpoint verifies on chain at the moment it runs.
 *
 * Pricing stays server-side for the same reason it always was. The function
 * that takes the money is the function that sets the price, so the number in
 * a paywall is the number that will actually be charged.
 *
 * No wallet is required: the price of a model is not private, and the paywall
 * shows it before sign-in.
 */

import { handleCorsPreflight, jsonResponse } from '../_shared/auth.ts';
import { DHB_USD_PEG, dhbToUsd, quotePriceDhb, type JobKind } from '../_shared/ai-pricing.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));

    const priceDhb = quotePriceDhb(
      String(body?.kind ?? '') as JobKind,
      String(body?.modelId ?? ''),
      {
        durationSeconds: body?.durationSeconds,
        quality: body?.quality,
        quantity: body?.quantity,
      },
    );

    if (priceDhb === null) {
      return jsonResponse({ error: `Unknown model: ${body?.kind}/${body?.modelId}` }, 400);
    }

    return jsonResponse({ priceDhb, priceUsd: dhbToUsd(priceDhb), pegUsd: DHB_USD_PEG });
  } catch (err) {
    console.error('[ai-quote] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'request failed' }, 500);
  }
});
