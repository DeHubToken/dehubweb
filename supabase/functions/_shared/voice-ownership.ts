/**
 * Who is allowed to perform with a given voice.
 * =============================================
 * Three functions take a `voiceId` and make it speak — elevenlabs-tts,
 * elevenlabs-dialogue and elevenlabs-voice-changer. Authenticating them stopped
 * an anonymous caller using the endpoints at all, and it did NOT stop a
 * signed-in one from naming somebody else's cloned voice.
 *
 * That is the half of the problem auth does not touch. A cloned voice is a
 * person's actual voice, so driving one you do not own is not a billing
 * question — the account holder ends up having said something they never said.
 *
 * ── What counts as yours ─────────────────────────────────────────────────────
 * `custom_voices` is the register of who cloned or designed what. A voice with
 * a row belongs to the wallet on that row and to nobody else. A voice with no
 * row is the shared ElevenLabs library, which everyone may use.
 *
 * That is one indexed lookup rather than a call to the provider, and it pairs
 * with the filtering in elevenlabs-voices: that endpoint only ever discloses
 * stock voices plus the caller's own, so the ids a user can discover are
 * already the ids this will let them use. Two layers, and neither depends on
 * the other being right.
 *
 * ── The gap this leaves ──────────────────────────────────────────────────────
 * An older clone path created voices without ever writing the row (see
 * src/lib/stage-dub-voice.ts). Those orphans have no owner to compare against,
 * so they pass. They are undiscoverable — elevenlabs-voices hides them on
 * category — and unattributable, so the residue is someone who already knows a
 * specific orphan id. Closing it properly means reconciling the provider's
 * voice list into custom_voices, which is a data job, not a request-path one.
 */

import { jsonResponse, serviceClient } from './auth.ts';

/**
 * Refuse the request if any of `voiceIds` is registered to another wallet.
 *
 * Returns a ready-to-send 403 on refusal, or null to carry on.
 *
 * Fails CLOSED, unlike the rate limiter above it. A lookup that did not answer
 * means ownership is unknown, and the wrong guess in that state is letting one
 * person speak as another. The cost of the other direction is a retryable error
 * on a call that had not spent anything yet.
 */
export async function refuseForeignVoice(
  voiceIds: (string | null | undefined)[],
  wallet: string,
): Promise<Response | null> {
  const wanted = [...new Set(voiceIds.filter((id): id is string => !!id))];
  if (wanted.length === 0) return null;

  const { data, error } = await serviceClient()
    .from('custom_voices')
    .select('elevenlabs_voice_id, wallet_address')
    .in('elevenlabs_voice_id', wanted);

  if (error) {
    console.error('[voice-ownership] lookup failed:', error);
    return jsonResponse(
      { error: 'Could not confirm that voice belongs to you. Try again.' },
      503,
    );
  }

  const owner = String(wallet).toLowerCase();
  for (const row of data ?? []) {
    if (String(row.wallet_address ?? '').toLowerCase() !== owner) {
      // Deliberately does not say whose it is, or even that it is a real voice
      // somebody owns — that would turn this into a lookup for whether a given
      // id is a clone.
      return jsonResponse({ error: 'That voice is not available to you.' }, 403);
    }
  }

  return null;
}
