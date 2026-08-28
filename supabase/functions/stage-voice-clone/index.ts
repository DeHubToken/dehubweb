// The host's voice for stage dubbing: cloning it, paying for it, switching it on and off.
// =======================================================================================
//
// Dubbing only sounds like the host if there is a voice to speak with. Getting
// one used to happen silently — thirty seconds into a stage the recorder's
// buffer was posted off to ElevenLabs and the result thrown away, because
// nothing wrote the returned id anywhere. Every stage since launch has dubbed
// in the stock narrator while quietly consuming a voice slot per page load.
//
// So it is explicit now, and it happens BEFORE going live: the host asks for
// it, records a sample, pays, and the voice exists by the time the room opens.
//
// `custom_voices.is_stage_voice` is the switch, and it is the thing every part
// of this file is really about:
//
//   * dub-line will speak in a personal voice ONLY if one is marked. That is
//     what makes "Dub me in my own voice" a box you can untick — without it,
//     turning the feature off would change nothing, because a wallet's other
//     voices would still be sitting there to be picked up.
//   * A wallet can hold several voices; the Studio's designer writes to the
//     same table. The mark says which one is the host, rather than letting a
//     monster preset trained last week answer for them.
//
// Three rules about the money, all of them the same rule from different sides:
// nobody pays twice for one voice.
//
//   * The transfer lands before the clone is attempted, and cloning can fail.
//     A failure therefore leaves the payment RECORDED AND UNSPENT, and the
//     retry re-presents it for free.
//   * `tx_hash` is unique, so a replayed hash collides instead of buying a
//     second voice.
//   * A wallet that already owns a clone is not charged for another — it marks
//     the one it has. Enabling and disabling are free forever after.
//
// The wallet comes from the verified DeHub token, never the header — see
// requireDeHubAuth. Everything that spends is keyed on that.
import { handleCorsPreflight, jsonResponse, serviceClient, guardPaidEndpoint, requireDeHubAuth } from '../_shared/auth.ts';
import { verifyDhbPayment, DHB_TREASURY } from '../_shared/dhb-transfer.ts';
import { quotePriceDhb } from '../_shared/ai-pricing.ts';

const MODEL_ID = 'voice-clone';

/** Instant cloning wants ten seconds of clean speech; the UI asks for fifteen. */
const MIN_SAMPLE_BYTES = 20_000;
const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;

function price(): number {
  return quotePriceDhb('tool', MODEL_ID) ?? 0;
}

interface OwnedVoice {
  id: string;
  elevenlabs_voice_id: string;
  name: string;
  is_stage_voice: boolean;
}

/**
 * The voice this wallet would dub with, if it turned dubbing on.
 *
 * Prefers one already marked, then the newest of anything else it owns — a
 * voice trained in the Studio before this flow existed is still a clone of a
 * real person, and charging to make a second one would be charging for
 * nothing.
 */
async function ownedVoice(wallet: string): Promise<OwnedVoice | null> {
  const { data } = await serviceClient()
    .from('custom_voices')
    .select('id, elevenlabs_voice_id, name, is_stage_voice')
    .ilike('wallet_address', wallet)
    .order('is_stage_voice', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OwnedVoice | null) ?? null;
}

/** A payment that landed but whose voice never did. The retry spends it. */
async function unspentCredit(wallet: string): Promise<{ id: string } | null> {
  const { data } = await serviceClient()
    .from('voice_clone_payments')
    .select('id')
    .ilike('wallet_address', wallet)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/**
 * Has this wallet ever paid for its stage voice?
 *
 * The fee buys an ENTITLEMENT, not an audio file, and this is what holds the
 * pricing together. Cloning is already free elsewhere in the app — the Studio's
 * training drawer is reachable from inside a stage room — so "free if you
 * happen to own a voice" would have been a paywall with an open door beside it.
 * Owning a voice saves the host the recording step. It does not replace the
 * fee.
 *
 * Once paid, it is paid forever: switching dubbing off and back on, re-cloning
 * after deleting the voice, hosting a thousand more stages — all free.
 */
async function hasPaid(wallet: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from('voice_clone_payments')
    .select('id')
    .ilike('wallet_address', wallet)
    .not('consumed_at', 'is', null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function setMark(wallet: string, voiceId: string | null): Promise<void> {
  const admin = serviceClient();
  // Clear whatever is marked first — one stage voice per wallet is enforced by
  // a partial unique index, so setting a new mark without clearing the old one
  // would be rejected.
  await admin
    .from('custom_voices')
    .update({ is_stage_voice: false })
    .ilike('wallet_address', wallet)
    .eq('is_stage_voice', true);

  if (voiceId) {
    await admin.from('custom_voices').update({ is_stage_voice: true }).eq('id', voiceId);
  }
}

function sanitiseName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, 50) : '';
  return name || 'Stage voice';
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const priceDhb = price();

  try {
    const contentType = req.headers.get('content-type') || '';

    // ─── JSON: quote, status, and the free switch ────────────────────────
    if (!contentType.includes('multipart/form-data')) {
      const body = await req.json().catch(() => null);
      const action = String(body?.action ?? 'quote');

      // A quote commits nothing and needs no wallet — it is the number the
      // host reads before deciding whether to do this at all.
      if (action === 'quote') {
        return jsonResponse({ modelId: MODEL_ID, priceDhb, treasury: DHB_TREASURY });
      }

      const auth = await requireDeHubAuth(req);
      if (!auth.ok) return auth.response;
      const wallet = auth.wallet;

      if (action === 'status') {
        const voice = await ownedVoice(wallet);
        const [credit, paid] = await Promise.all([unspentCredit(wallet), hasPaid(wallet)]);
        return jsonResponse({
          priceDhb,
          treasury: DHB_TREASURY,
          /** Has a voice already — so no recording step, whatever is owed. */
          owned: !!voice,
          /** Has paid before. Switching on and off is free from here on. */
          entitled: paid || !!voice?.is_stage_voice,
          /** Dubbing is currently set to use it. This is what the box shows. */
          enabled: !!voice?.is_stage_voice,
          voiceName: voice?.name ?? null,
          /** Paid once already and never got a voice for it. */
          creditedRetry: !!credit,
        });
      }

      // Switching on a voice this wallet has already paid for. Free, and the
      // only path that should ever run for a returning host.
      if (action === 'enable') {
        const voice = await ownedVoice(wallet);
        if (!voice) return jsonResponse({ error: 'No voice to switch on.', code: 'NO_VOICE' }, 404);
        if (!voice.is_stage_voice && !(await hasPaid(wallet))) {
          // Owning a voice is not the same as having bought stage dubbing in
          // it — see hasPaid. Send them to the paid route rather than letting
          // a free Studio clone through the side.
          return jsonResponse({ error: 'Payment required.', code: 'PAYMENT_REQUIRED', priceDhb }, 402);
        }
        await setMark(wallet, voice.id);
        return jsonResponse({ enabled: true, voiceName: voice.name, charged: false });
      }

      // Switching it off. The voice stays on the account — they paid for it —
      // but nothing dubs in it until it is switched back on.
      if (action === 'release') {
        await setMark(wallet, null);
        return jsonResponse({ enabled: false });
      }

      return jsonResponse({ error: 'Unknown action' }, 400);
    }

    // ─── Multipart: creating the voice ───────────────────────────────────
    //
    // Rate-limited as well as authenticated: this reaches a paid provider and
    // permanently occupies a voice slot, so it is worth bounding even behind
    // a payment check.
    const guard = await guardPaidEndpoint(req, 'stage-voice-clone', {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!guard.ok) return guard.response;
    const wallet = guard.wallet;
    const admin = serviceClient();

    const form = await req.formData();
    const raw = form.get('file');
    const file = raw instanceof File ? raw : null;
    const txHash = String(form.get('txHash') ?? '').trim();
    const name = sanitiseName(form.get('name'));

    // Already entitled? Switch it on and charge nothing. This runs before the
    // payment is looked at on purpose: a client that paid anyway gets told so
    // rather than having the transfer quietly banked.
    const owned = await ownedVoice(wallet);
    const entitled = !!owned?.is_stage_voice || (await hasPaid(wallet));
    if (owned && entitled) {
      await setMark(wallet, owned.id);
      return jsonResponse({ voiceId: owned.elevenlabs_voice_id, name: owned.name, charged: false, adopted: true });
    }

    // A sample is only needed when there is nothing to speak with yet. A host
    // who already has a voice is buying stage dubbing in it, not another copy
    // of it — no recording, no second ElevenLabs voice slot.
    if (!owned) {
      if (!file) return jsonResponse({ error: 'A voice sample is required.' }, 400);
      if (file.size < MIN_SAMPLE_BYTES) {
        return jsonResponse({ error: 'That sample is too short. Record about fifteen seconds of speech.' }, 400);
      }
      if (file.size > MAX_SAMPLE_BYTES) {
        return jsonResponse({ error: 'That sample is too large. Keep it under 10MB.' }, 400);
      }
    }

    // ─── Payment ─────────────────────────────────────────────────────────
    //
    // A credit already on the books is spent FIRST, whatever the client sent.
    // The client checks for one before paying, so a hash arriving alongside a
    // credit means two attempts raced — and in that case the new transfer is
    // still recorded rather than ignored, because it is real money and the
    // row is what a refund would be worked out from.
    let paymentId: string;
    const credit = await unspentCredit(wallet);

    if (credit) {
      paymentId = credit.id;
      if (txHash) {
        const payment = await verifyDhbPayment(txHash, wallet, priceDhb);
        if (payment.ok) {
          await admin.from('voice_clone_payments').insert({
            wallet_address: wallet,
            tx_hash: payment.hash.toLowerCase(),
            price_dhb: priceDhb,
            chain: payment.chain,
          });
          console.warn(`[stage-voice-clone] ${wallet} paid ${txHash} while already holding a credit`);
        }
      }
    } else if (txHash) {
      const { data: seen } = await admin
        .from('voice_clone_payments')
        .select('id, wallet_address, consumed_at')
        .eq('tx_hash', txHash.toLowerCase())
        .maybeSingle();

      if (seen) {
        // One transfer, one voice.
        if (seen.consumed_at) {
          return jsonResponse({ error: 'That payment has already been used.', code: 'PAYMENT_SPENT' }, 409);
        }
        if (String(seen.wallet_address).toLowerCase() !== wallet) {
          return jsonResponse({ error: 'That payment belongs to another wallet.' }, 403);
        }
        paymentId = seen.id;
      } else {
        const payment = await verifyDhbPayment(txHash, wallet, priceDhb);
        if (!payment.ok) {
          return jsonResponse({ error: payment.reason, code: 'PAYMENT_UNVERIFIED', priceDhb }, 402);
        }
        const { data: row, error: insErr } = await admin
          .from('voice_clone_payments')
          .insert({
            wallet_address: wallet,
            tx_hash: payment.hash.toLowerCase(),
            price_dhb: priceDhb,
            chain: payment.chain,
          })
          .select('id')
          .single();
        // A unique violation here means the same hash arrived twice at once.
        // Refuse rather than clone twice off one transfer.
        if (insErr || !row) {
          return jsonResponse({ error: 'That payment is already being used.', code: 'PAYMENT_SPENT' }, 409);
        }
        paymentId = row.id;
      }
    } else {
      return jsonResponse({ error: 'Payment required.', code: 'PAYMENT_REQUIRED', priceDhb }, 402);
    }

    // Paid, and the voice already exists — nothing to clone. Mark it, close
    // the payment, done. This is the path for a host who trained a voice in
    // the Studio and is now buying stage dubbing in it.
    if (owned) {
      await setMark(wallet, owned.id);
      await admin
        .from('voice_clone_payments')
        .update({ voice_id: owned.elevenlabs_voice_id, consumed_at: new Date().toISOString() })
        .eq('id', paymentId);
      console.log(`[stage-voice-clone] ${wallet} bought stage dubbing in existing voice for ${priceDhb} DHB`);
      return jsonResponse({ voiceId: owned.elevenlabs_voice_id, name: owned.name, charged: true, adopted: true });
    }

    // ─── The clone ───────────────────────────────────────────────────────
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      // Paid, undelivered, retryable. Never consume the payment on our own
      // misconfiguration.
      return jsonResponse(
        { error: 'Voice cloning is not configured. Your payment is held and the retry is free.', code: 'CLONE_FAILED' },
        503,
      );
    }

    // Unreachable — `owned` is false here and the branch above already
    // required a sample — but this is the one place a wrong answer would spend
    // the payment on nothing, so it re-asks rather than assuming.
    if (!file) {
      return jsonResponse({ error: 'A voice sample is required. Your payment is held and the retry is free.', code: 'CLONE_FAILED' }, 400);
    }

    const cloneForm = new FormData();
    cloneForm.append('name', name);
    cloneForm.append('files', file, file.name || 'stage-voice.webm');
    // Ownership belongs in custom_voices, not in a provider-side string that
    // the app's own voice list hands back to whoever asks.
    cloneForm.append('description', 'DeHub stage voice');

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: cloneForm,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[stage-voice-clone] ElevenLabs refused', res.status, detail);
      return jsonResponse(
        {
          error: 'Cloning failed — make sure the recording is clear and at least fifteen seconds. Your payment is held and the retry is free.',
          code: 'CLONE_FAILED',
        },
        502,
      );
    }

    const cloned = await res.json();
    const voiceId = typeof cloned?.voice_id === 'string' ? cloned.voice_id : '';
    if (!voiceId) {
      console.error('[stage-voice-clone] clone returned no voice id', cloned);
      return jsonResponse(
        { error: 'Cloning did not return a voice. Your payment is held and the retry is free.', code: 'CLONE_FAILED' },
        502,
      );
    }

    // ─── Delivery ────────────────────────────────────────────────────────
    //
    // This is the write the old auto-clone never made, which is why none of
    // its clones were ever usable. The payment is consumed only after it
    // lands.
    const { error: saveErr } = await admin.from('custom_voices').insert({
      wallet_address: wallet,
      elevenlabs_voice_id: voiceId,
      name,
      is_stage_voice: true,
    });
    if (saveErr) {
      console.error('[stage-voice-clone] could not save voice', saveErr);
      return jsonResponse(
        { error: 'Your voice was created but could not be saved. Your payment is held and the retry is free.', code: 'CLONE_FAILED' },
        500,
      );
    }

    await admin
      .from('voice_clone_payments')
      .update({ voice_id: voiceId, consumed_at: new Date().toISOString() })
      .eq('id', paymentId);

    console.log(`[stage-voice-clone] ${wallet} cloned ${voiceId} for ${priceDhb} DHB`);
    return jsonResponse({ voiceId, name, charged: true, adopted: false });
  } catch (err) {
    console.error('[stage-voice-clone] error', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
