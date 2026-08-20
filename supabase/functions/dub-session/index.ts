// Sell one block of live dubbing to a listener, in DHB.
//
// Billing is per block of wall-clock time, not per line. A twenty-minute stage
// finalises around 220 sentences; charging per sentence would mean 220 debits,
// 220 ledger rows, and — because quotePriceDhb rounds up to whole DHB — a
// price inflated by the rounding on every one of them. Sixty-second blocks
// give one rounding event a minute, twenty ledger rows for a full listen, and
// a stop-loss: nobody can overspend by more than one block.
//
// The listener pays; the speakers' clients do the generating. See
// _shared/dub-entitlement.ts for how those two halves are connected without a
// database table.
import { handleCorsPreflight, jsonResponse, serviceClient } from '../_shared/auth.ts';
import { chargeForJob } from '../_shared/ai-credit-guard.ts';
import { signEntitlement } from '../_shared/dub-entitlement.ts';
import { quotePriceDhb } from '../_shared/ai-pricing.ts';

/** One block. Long enough to amortise the round trip, short enough to be a small loss if abandoned. */
const BLOCK_SECONDS = 60;
/**
 * Grace on top of the block before the token stops verifying. Covers the gap
 * between a listener's clock and ours, so the last sentence of a paid minute
 * is not refused for being a few hundred milliseconds late.
 */
const TOKEN_GRACE_MS = 10_000;

const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr', 'id',
]);

/**
 * Which voice this stage dubs in.
 *
 * The host's own cloned voice when they have trained one, otherwise a stock
 * voice. Resolved here rather than from anything the client sends, and it does
 * not move the price: synthesising a stock voice costs what synthesising a
 * cloned one costs. Today it is always the stock voice — `custom_voices` is empty.
 */
async function resolveVoice(
  stageId: string,
): Promise<{ modelId: 'dub-live'; voiceId: string | null; hostWallet: string | null }> {
  const admin = serviceClient();
  const { data: stage } = await admin
    .from('audio_spaces')
    .select('host_wallet_address')
    .eq('id', stageId)
    .maybeSingle();

  const hostWallet = (stage?.host_wallet_address || '').toLowerCase() || null;
  if (!hostWallet) return { modelId: 'dub-live', voiceId: null, hostWallet: null };

  const { data: voice } = await admin
    .from('custom_voices')
    .select('elevenlabs_voice_id')
    .ilike('wallet_address', hostWallet)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return voice?.elevenlabs_voice_id
    ? { modelId: 'dub-live', voiceId: voice.elevenlabs_voice_id, hostWallet }
    : { modelId: 'dub-live', voiceId: null, hostWallet };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const body = await req.json().catch(() => null);
    const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : '';
    const language = typeof body?.language === 'string' ? body.language : '';
    const quoteOnly = body?.quoteOnly === true;

    if (!spaceId || !SUPPORTED_LANGUAGES.has(language)) {
      return jsonResponse({ error: 'spaceId and a supported language are required' }, 400);
    }

    const { modelId, voiceId } = await resolveVoice(spaceId);

    // A quote costs nothing and takes no payment — it is what the listener
    // sees before deciding, so it must never be the thing that charges them.
    if (quoteOnly) {
      return jsonResponse({
        modelId,
        blockSeconds: BLOCK_SECONDS,
        priceDhb: quotePriceDhb('dub', modelId, { durationSeconds: BLOCK_SECONDS }),
        clonedVoice: !!voiceId,
      });
    }

    // Auth, per-wallet rate limit and the DHB debit in one step. A two-hour
    // listen is 120 blocks, so the cap is a runaway guard rather than a ration.
    const charge = await chargeForJob(req, {
      kind: 'dub',
      modelId,
      actionType: 'dub-session',
      rateLimit: { limit: 300, windowMs: 60 * 60 * 1000 },
      durationSeconds: BLOCK_SECONDS,
    });
    if (!charge.ok) return charge.response;

    const expiresAt = Date.now() + BLOCK_SECONDS * 1000 + TOKEN_GRACE_MS;
    const token = await signEntitlement({ s: spaceId, l: language, m: modelId, e: expiresAt });

    console.log(`[dub-session] ${charge.wallet} bought ${BLOCK_SECONDS}s of ${language} (${modelId}, ${charge.priceDhb} DHB)`);

    return jsonResponse({
      token,
      expiresAt,
      blockSeconds: BLOCK_SECONDS,
      priceDhb: charge.priceDhb,
      modelId,
      clonedVoice: !!voiceId,
      jobId: charge.jobId,
    });
  } catch (e) {
    console.error('[dub-session]', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
