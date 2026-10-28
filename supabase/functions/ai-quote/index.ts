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

import { handleCorsPreflight, jsonResponse, requireDeHubAuth, rateLimitByIp } from '../_shared/auth.ts';
import { DHB_USD_PEG, dhbToUsd, quotePriceDhb, type JobKind } from '../_shared/ai-pricing.ts';
import { isVeniceImage, isVeniceVideo } from '../_shared/venice-catalog.ts';
import { quoteVenice } from '../_shared/venice.ts';
import { seedance2QuoteRoute } from '../_shared/seedance2-input.ts';
import { AVATAR_MODEL, prepareAvatar } from '../_shared/creator-avatar.ts';
import { kieKey } from '../_shared/kie.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => ({}));

    const modelId = String(body?.modelId ?? '');
    if ((body.kind === 'image' && isVeniceImage(modelId)) || (body.kind === 'video' && isVeniceVideo(modelId))) {
      return jsonResponse({ ...await quoteVenice(modelId, body), pegUsd: DHB_USD_PEG });
    }

    if (body.kind === 'video' && modelId === AVATAR_MODEL) {
      try {
        const auth = await requireDeHubAuth(req);
        if (!auth.ok) return auth.response;
        const limited = await rateLimitByIp(req, 'creator-avatar-quote', { limit: 30, windowMs: 60 * 60 * 1000 });
        if (limited) return limited;
        const prepared = await prepareAvatar(body.avatar, body.avatarPrompt);
        const priceDhb = quotePriceDhb('video', modelId, { durationSeconds: prepared.durationSeconds });
        if (!priceDhb) throw new Error('Avatar pricing is unavailable');
        return jsonResponse({ priceDhb, priceUsd: dhbToUsd(priceDhb), pegUsd: DHB_USD_PEG, inputDigest: prepared.inputDigest, durationSeconds: prepared.durationSeconds });
      } catch (error) { return jsonResponse({ error: (error as Error).message }, 400); }
    }
    let videoProvider: 'kie' | 'fal' | undefined;
    if (body.kind === 'video' && ['seedance-2.0', 'seedance-2.0-fast'].includes(modelId)) {
      try { videoProvider = seedance2QuoteRoute(modelId, body, !!kieKey()).provider; }
      catch (error) { return jsonResponse({ error: (error as Error).message }, 400); }
    }
    const priceDhb = quotePriceDhb(
      String(body?.kind ?? '') as JobKind,
      String(body?.modelId ?? ''),
      {
        durationSeconds: body?.durationSeconds,
        quality: body?.quality,
        quantity: body?.quantity,
        videoProvider,
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
