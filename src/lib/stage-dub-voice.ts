/**
 * The host's voice for dubbing — consent, and getting one without asking twice.
 * ============================================================================
 *
 * Dubbing sounds like the host only if there is a cloned voice to speak with,
 * and the honest ways to get one both have friction: send them off to train a
 * voice before going live, or accept a stock narrator forever. This takes the
 * third path — clone from the stage they are already broadcasting — with the
 * one thing that makes it acceptable attached: they agreed to it at launch.
 */

import { supabase } from '@/integrations/supabase/client';

const CONSENT_KEY = 'dehub.stage.dubVoiceConsent';

/** Did the host agree, when starting a stage, to be dubbed in their own voice? */
export function dubVoiceConsentGiven(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDubVoiceConsent(value: boolean) {
  try {
    if (value) window.localStorage.setItem(CONSENT_KEY, '1');
    else window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* private mode — they will be asked again next time, which is the safe way to fail */
  }
}

/** Cloning is slow and pointless to repeat; once per page load is plenty. */
let cloneAttempted = false;

/**
 * Clone the host's voice from what the stage recorder has already captured.
 *
 * Best-effort throughout. A failure means this stage dubs in the stock voice,
 * which is exactly what would have happened anyway — so nothing here surfaces
 * an error at a host who is in the middle of talking to a room.
 */
export async function cloneHostVoiceFromStage(
  chunks: Blob[],
  wallet: string | null,
  displayName: string,
): Promise<boolean> {
  if (cloneAttempted || !wallet || !chunks.length) return false;
  cloneAttempted = true;

  try {
    // Already have one? Then there is nothing to do and never will be.
    const { data: existing } = await supabase
      .from('custom_voices')
      .select('id')
      .ilike('wallet_address', wallet)
      .limit(1)
      .maybeSingle();
    if (existing) return false;

    // Instant cloning wants at least ten seconds of clean speech. Take what the
    // recorder has so far — at one chunk a second that is the opening half
    // minute, which on any real stage is the host talking.
    const sample = new Blob(chunks, { type: 'audio/webm' });
    if (sample.size < 24_000) return false;

    const form = new FormData();
    form.append('name', `${displayName || 'Host'} — stage voice`);
    form.append('file', sample, 'stage-sample.webm');

    const { error } = await supabase.functions.invoke('elevenlabs-clone-voice', {
      body: form,
      headers: { 'x-wallet-address': wallet.toLowerCase() },
    });
    if (error) {
      console.warn('[Stage] voice clone failed; dubbing uses the stock voice', error);
      return false;
    }

    console.log('[Stage] cloned host voice for dubbing');
    return true;
  } catch (err) {
    console.warn('[Stage] voice clone failed', err);
    return false;
  }
}
