// Live dubbing, paid for in DHB — the same token everything else in the app is
// paid with, straight from the listener's own wallet.
//
// It runs a tab rather than a meter. Signing a transfer every minute is not a
// thing you can do to someone in the middle of live audio, so the minutes are
// counted here and the wallet is asked once, at the end: one transfer, for the
// minutes actually listened to. That is the same shape as unlocking a PPV post
// or sending a tip.
//
// Because we speak before we are paid, three things bound the exposure:
//
//   * `start` refuses unless the listener's wallet already holds
//     MIN_START_MINUTES of DHB, so nobody opens a tab they cannot pay.
//   * minutes stop accruing past MAX_UNSETTLED_MINUTES.
//   * an unsettled tab blocks starting another, so exposure per wallet is one
//     stage rather than however many they open.
//
// Minutes are counted by `stage_dub_tick` in the database, never by the client:
// the client is the party that would benefit from under-reporting them. And the
// bill is closed only against a transfer confirmed on chain — `settle` believes
// the chain, not the caller.
import { handleCorsPreflight, jsonResponse, serviceClient, guardPaidEndpoint } from '../_shared/auth.ts';
import { verifyDhbPayment, DHB_TREASURY } from '../_shared/dhb-transfer.ts';
import { signEntitlement } from '../_shared/dub-entitlement.ts';
import { quotePriceDhb } from '../_shared/ai-pricing.ts';

const MODEL_ID = 'dub-live';
const BLOCK_SECONDS = 60;
const TOKEN_GRACE_MS = 15_000;

/** DHB a listener must already hold before opening a tab. */
const MIN_START_MINUTES = 10;
/** Longest tab we let run before it has to be settled. */
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

    // A quote commits nothing and needs no wallet — it is what the listener
    // reads before deciding.
    if (action === 'quote') {
      if (!spaceId) return jsonResponse({ error: 'spaceId is required' }, 400);
      return jsonResponse({
        modelId: MODEL_ID,
        pricePerMinuteDhb: perMinute,
        minimumDhb: perMinute * MIN_START_MINUTES,
        treasury: DHB_TREASURY,
        clonedVoice: await hasClonedVoice(spaceId),
      });
    }

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

      // An unpaid tab has to be cleared first. It is the only real collection
      // lever a pay-after model has, and naming the stage makes settling it
      // one click rather than a mystery.
      const open = (await unsettled(wallet)).filter((tab) => tab.space_id !== spaceId);
      if (open.length) {
        return jsonResponse({
          error: 'Pay for your last dubbing session first.',
          code: 'UNSETTLED',
          unsettled: open,
        }, 409);
      }

      const { token, expiresAt } = await mintToken(spaceId, language);
      return jsonResponse({
        token,
        expiresAt,
        minutes: 0,
        pricePerMinuteDhb: perMinute,
        treasury: DHB_TREASURY,
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
          return jsonResponse({ error: 'That session is already paid.', code: 'SETTLED' }, 409);
        }
        throw error;
      }

      const minutes = Number(data ?? 0);
      if (minutes >= MAX_UNSETTLED_MINUTES) {
        return jsonResponse({
          error: 'This dubbing session has run long enough to need paying for.',
          code: 'SETTLE_REQUIRED',
          minutes,
          owedDhb: minutes * perMinute,
        }, 409);
      }

      const { token, expiresAt } = await mintToken(spaceId, language);
      return jsonResponse({ token, expiresAt, minutes, owedDhb: minutes * perMinute });
    }

    if (action === 'bill') {
      if (!spaceId) return jsonResponse({ error: 'spaceId is required' }, 400);
      const { data: tab } = await serviceClient()
        .from('stage_dub_usage')
        .select('minutes, price_dhb_per_min, settled_at')
        .eq('space_id', spaceId)
        .ilike('wallet_address', wallet)
        .maybeSingle();
      const minutes = tab?.settled_at ? 0 : Number(tab?.minutes ?? 0);
      return jsonResponse({
        minutes,
        owedDhb: minutes * Number(tab?.price_dhb_per_min ?? perMinute),
        treasury: DHB_TREASURY,
        settled: !!tab?.settled_at,
      });
    }

    if (action === 'settle') {
      if (!spaceId) return jsonResponse({ error: 'spaceId is required' }, 400);
      const txHash = typeof body?.txHash === 'string' ? body.txHash : '';

      const admin = serviceClient();
      const { data: tab } = await admin
        .from('stage_dub_usage')
        .select('minutes, price_dhb_per_min, settled_at')
        .eq('space_id', spaceId)
        .ilike('wallet_address', wallet)
        .maybeSingle();

      if (!tab) return jsonResponse({ error: 'Nothing to pay for.', code: 'NO_TAB' }, 404);
      if (tab.settled_at) return jsonResponse({ ok: true, alreadySettled: true, minutes: tab.minutes });

      const minutes = Number(tab.minutes ?? 0);
      const owed = minutes * Number(tab.price_dhb_per_min ?? perMinute);

      // Nothing heard, nothing owed — close it without asking for a transfer.
      if (minutes <= 0 || owed <= 0) {
        await admin.from('stage_dub_usage')
          .update({ settled_at: new Date().toISOString(), settled_ref: 'zero' })
          .eq('space_id', spaceId).ilike('wallet_address', wallet);
        return jsonResponse({ ok: true, minutes: 0, paidDhb: 0 });
      }

      // The chain is the authority. A caller claiming to have paid proves it
      // with a hash, and this refuses everything it cannot confirm.
      const payment = await verifyDhbPayment(txHash, wallet, owed);
      if (!payment.ok) {
        return jsonResponse({ error: payment.reason, code: 'PAYMENT_UNVERIFIED', owedDhb: owed, minutes }, 402);
      }

      // `settled_ref` is unique, so the same transfer cannot close a second
      // tab: a replayed hash collides here rather than paying twice over.
      const { error: closeError } = await admin
        .from('stage_dub_usage')
        .update({ settled_at: new Date().toISOString(), settled_ref: payment.hash })
        .eq('space_id', spaceId)
        .ilike('wallet_address', wallet)
        .is('settled_at', null);

      if (closeError) {
        console.error('[dub-session] settle close failed', closeError);
        return jsonResponse({ error: 'That payment went through but the session did not close. Contact support rather than paying again.' }, 500);
      }

      console.log(`[dub-session] paid ${wallet} ${minutes}min = ${owed} DHB on ${payment.chain} (${payment.hash})`);
      return jsonResponse({ ok: true, minutes, paidDhb: owed, chain: payment.chain, txHash: payment.hash });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error('[dub-session]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
