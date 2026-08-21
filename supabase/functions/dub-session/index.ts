// Live dubbing, sold on a tab rather than a meter.
//
// The first version debited a minute at a time. It worked and never prompted a
// wallet, but it turned one purchase into twenty ledger rows and made "what did
// that cost me" something you had to add up. This runs a tab instead: check the
// listener can afford it, count the minutes on the server, and take the whole
// amount once, on a confirmation, when the stage ends.
//
// What that trades away is certainty of collection — we spend on speech during
// the stage and collect after it. Three things hold that down:
//
//   * `start` refuses unless the wallet already holds MIN_START_MINUTES of
//     credit, so nobody opens a tab they visibly cannot pay.
//   * `tick` re-checks the balance every minute and refuses once it stops
//     covering what is already owed — a wallet drained elsewhere mid-stage
//     stops dubbing rather than running up more.
//   * an unsettled tab blocks starting another, so exposure per wallet is
//     bounded by one stage rather than by however many they open.
//
// Minutes are counted by `stage_dub_tick` in the database, never by the client:
// the client is the party that would benefit from under-reporting them.
import { handleCorsPreflight, jsonResponse, serviceClient, guardPaidEndpoint } from '../_shared/auth.ts';
import { chargeForJob } from '../_shared/ai-credit-guard.ts';
import { signEntitlement } from '../_shared/dub-entitlement.ts';
import { quotePriceDhb } from '../_shared/ai-pricing.ts';

const MODEL_ID = 'dub-live';
const BLOCK_SECONDS = 60;
const TOKEN_GRACE_MS = 15_000;

/** Credit a wallet must already hold before it may open a tab. */
const MIN_START_MINUTES = 10;
/** Longest tab we let run before it has to be settled. Caps exposure per stage. */
const MAX_UNSETTLED_MINUTES = 180;

const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr', 'id',
]);

function pricePerMinute(): number {
  return quotePriceDhb('dub', MODEL_ID, { durationSeconds: BLOCK_SECONDS }) ?? 0;
}

/** Does this stage have the host's own voice to dub in? Display only — it does not move the price. */
async function hasClonedVoice(stageId: string): Promise<boolean> {
  const admin = serviceClient();
  const { data: stage } = await admin
    .from('audio_spaces')
    .select('host_wallet_address')
    .eq('id', stageId)
    .maybeSingle();
  const hostWallet = (stage?.host_wallet_address || '').toLowerCase();
  if (!hostWallet) return false;

  const { data: voice } = await admin
    .from('custom_voices')
    .select('id')
    .ilike('wallet_address', hostWallet)
    .limit(1)
    .maybeSingle();
  return !!voice;
}

async function balanceDhb(wallet: string): Promise<number> {
  const { data } = await serviceClient()
    .from('ai_credits')
    .select('balance_dhb')
    .ilike('wallet_address', wallet)
    .maybeSingle();
  return Number(data?.balance_dhb ?? 0);
}

interface UnsettledTab {
  space_id: string;
  minutes: number;
  price_dhb_per_min: number;
  owed_dhb: number;
}

async function unsettled(wallet: string): Promise<UnsettledTab[]> {
  const { data } = await serviceClient().rpc('stage_dub_unsettled', { p_wallet: wallet });
  return (data as UnsettledTab[]) ?? [];
}

async function mintToken(spaceId: string, language: string): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + BLOCK_SECONDS * 1000 + TOKEN_GRACE_MS;
  return { token: await signEntitlement({ s: spaceId, l: language, m: MODEL_ID, e: expiresAt }), expiresAt };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? 'quote');
    const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
    const language = typeof body?.language === 'string' ? body.language : '';
    const perMinute = pricePerMinute();

    // A quote takes no payment and needs no wallet — it is what the listener
    // reads before deciding, so it must never be the thing that commits them.
    if (action === 'quote') {
      if (!spaceId) return jsonResponse({ error: 'spaceId is required' }, 400);
      return jsonResponse({
        modelId: MODEL_ID,
        pricePerMinuteDhb: perMinute,
        minimumBalanceDhb: perMinute * MIN_START_MINUTES,
        clonedVoice: await hasClonedVoice(spaceId),
      });
    }

    // Everything past here is wallet-scoped. No debit happens on start or tick.
    const guard = await guardPaidEndpoint(req, 'dub-session', {
      limit: 400,
      windowMs: 60 * 60 * 1000,
    });
    if (!guard.ok) return guard.response;
    const wallet = guard.wallet;

    if (action === 'start') {
      if (!spaceId || !SUPPORTED_LANGUAGES.has(language)) {
        return jsonResponse({ error: 'spaceId and a supported language are required' }, 400);
      }

      // An unpaid tab from an earlier stage has to be cleared first. It is the
      // only real collection lever a post-paid model has, so it is worth being
      // firm about — and naming the stage makes settling one click.
      const open = (await unsettled(wallet)).filter((tab) => tab.space_id !== spaceId);
      if (open.length) {
        return jsonResponse({
          error: 'Settle your last dubbing session first.',
          code: 'UNSETTLED',
          unsettled: open,
        }, 409);
      }

      const balance = await balanceDhb(wallet);
      const minimum = perMinute * MIN_START_MINUTES;
      if (balance < minimum) {
        return jsonResponse({
          error: `Dubbing needs at least ${minimum} DHB of credit to start.`,
          code: 'INSUFFICIENT_CREDITS',
          balanceDhb: balance,
          requiredDhb: minimum,
          pricePerMinuteDhb: perMinute,
        }, 402);
      }

      const { token, expiresAt } = await mintToken(spaceId, language);
      return jsonResponse({
        token,
        expiresAt,
        minutes: 0,
        pricePerMinuteDhb: perMinute,
        balanceDhb: balance,
        clonedVoice: await hasClonedVoice(spaceId),
      });
    }

    if (action === 'tick') {
      if (!spaceId || !SUPPORTED_LANGUAGES.has(language)) {
        return jsonResponse({ error: 'spaceId and a supported language are required' }, 400);
      }

      const { data, error } = await serviceClient().rpc('stage_dub_tick', {
        p_space_id: spaceId,
        p_wallet: wallet,
        p_language: language,
        p_price_per_min: perMinute,
      });
      if (error) {
        if (String(error.message || '').includes('DUB_ALREADY_SETTLED')) {
          return jsonResponse({ error: 'That session is already settled.', code: 'SETTLED' }, 409);
        }
        throw error;
      }

      const minutes = Number(data ?? 0);
      const owed = minutes * perMinute;
      const balance = await balanceDhb(wallet);

      // Stop the moment the balance stops covering the tab. Carrying on would
      // be running up a bill we already know cannot be paid.
      if (balance < owed) {
        return jsonResponse({
          error: 'Not enough DHB left to keep dubbing.',
          code: 'INSUFFICIENT_CREDITS',
          minutes,
          owedDhb: owed,
          balanceDhb: balance,
        }, 402);
      }
      if (minutes >= MAX_UNSETTLED_MINUTES) {
        return jsonResponse({
          error: 'This dubbing session has run long enough to need settling.',
          code: 'SETTLE_REQUIRED',
          minutes,
          owedDhb: owed,
        }, 409);
      }

      const { token, expiresAt } = await mintToken(spaceId, language);
      return jsonResponse({ token, expiresAt, minutes, owedDhb: owed, balanceDhb: balance });
    }

    if (action === 'settle') {
      if (!spaceId) return jsonResponse({ error: 'spaceId is required' }, 400);

      const admin = serviceClient();
      const { data: tab } = await admin
        .from('stage_dub_usage')
        .select('minutes, price_dhb_per_min, settled_at')
        .eq('space_id', spaceId)
        .ilike('wallet_address', wallet)
        .maybeSingle();

      if (!tab) return jsonResponse({ error: 'Nothing to settle.', code: 'NO_TAB' }, 404);
      if (tab.settled_at) {
        return jsonResponse({ ok: true, alreadySettled: true, minutes: tab.minutes, chargedDhb: 0 });
      }

      const minutes = Number(tab.minutes ?? 0);
      if (minutes <= 0) {
        await admin.from('stage_dub_usage')
          .update({ settled_at: new Date().toISOString(), settled_ref: 'zero' })
          .eq('space_id', spaceId).ilike('wallet_address', wallet);
        return jsonResponse({ ok: true, minutes: 0, chargedDhb: 0 });
      }

      // One debit for the whole session, priced off the same per-minute rate
      // the tab recorded, so a price change mid-stage cannot reprice minutes
      // already listened to.
      const charge = await chargeForJob(req, {
        kind: 'dub',
        modelId: MODEL_ID,
        actionType: 'dub-settle',
        rateLimit: { limit: 60, windowMs: 60 * 60 * 1000 },
        durationSeconds: BLOCK_SECONDS * minutes,
      });
      if (!charge.ok) return charge.response;

      const { error: closeError } = await admin
        .from('stage_dub_usage')
        .update({ settled_at: new Date().toISOString(), settled_ref: charge.jobId })
        .eq('space_id', spaceId)
        .ilike('wallet_address', wallet)
        .is('settled_at', null);

      // Taking the money and failing to close the tab would bill them for the
      // same minutes again. Give it back rather than leave that possible.
      if (closeError) {
        await charge.refund();
        console.error('[dub-session] settle close failed, refunded', closeError);
        return jsonResponse({ error: 'Could not close that session. Nothing was charged.' }, 500);
      }

      console.log(`[dub-session] settled ${wallet} ${minutes}min = ${charge.priceDhb} DHB (${spaceId})`);
      return jsonResponse({ ok: true, minutes, chargedDhb: charge.priceDhb });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error('[dub-session]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
