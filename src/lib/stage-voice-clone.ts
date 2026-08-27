/**
 * The host's stage voice — buying it, switching it on, switching it off.
 * ======================================================================
 *
 * A host who wants international listeners to hear THEM rather than a stock
 * narrator records fifteen seconds, pays once in DHB, and owns the voice from
 * then on. Every later stage reuses it; there is no second charge, because
 * there is nothing to buy a second time.
 *
 * The server decides all of it — the price, whether anything is owed at all,
 * and whether dubbing is currently set to use the voice. That last one is
 * `custom_voices.is_stage_voice`, and it is the real "Dub me in my own voice"
 * switch: `dub-line` speaks in a personal voice only when one is marked, so
 * unticking the box actually stops it rather than just forgetting a preference.
 *
 * What the fee buys is the ENTITLEMENT, not the audio. Cloning is already free
 * elsewhere in the app — the Studio's training drawer is reachable from inside
 * a stage room — so charging only people who lack a voice would have been a
 * paywall with an open door beside it. Owning a voice skips the recording step
 * and costs the same.
 *
 * Three ways this ends up costing nothing, all worth keeping:
 *
 *   * Paid before, on this wallet — switching it on again is free, forever.
 *   * A clone that failed after the transfer landed leaves the payment on the
 *     books; the retry spends it instead of asking for more.
 *   * Turning it off and on again, forever, is free.
 *
 * `dhb-payment` is imported dynamically, never at the top. This module is
 * reached from AudioSpacesModalBody, which AppLayout pulls in statically — a
 * top-level import drags aa-utils, wagmi and RainbowKit into the entry chunk
 * and `scripts/check-entry-bundle.mjs` fails the build. Same reason
 * `use-stage-dubbing` and `use-ppv-payment` reach for it behind an await.
 */

import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';

const FUNCTION = 'stage-voice-clone';

export interface VoiceCloneStatus {
  priceDhb: number;
  treasury: string;
  /** Has a voice already — so no recording step, whatever is owed. */
  owned: boolean;
  /** Has paid before. Switching on and off is free from here on. */
  entitled: boolean;
  /** Dubbing is currently set to use it. This is what the checkbox shows. */
  enabled: boolean;
  voiceName: string | null;
  /** A previous payment landed but its clone never did. The retry is free. */
  creditedRetry: boolean;
}

export interface VoiceCloneResult {
  voiceId: string;
  name: string;
  charged: boolean;
  adopted: boolean;
}

export class VoiceCloneError extends Error {
  code?: string;
  /** True when the DHB has already left the wallet — never say "try again". */
  paid: boolean;

  constructor(message: string, code?: string, paid = false) {
    super(message);
    this.name = 'VoiceCloneError';
    this.code = code;
    this.paid = paid;
  }
}

async function authHeaders(wallet: string): Promise<Record<string, string>> {
  const token = await ensureFreshToken();
  if (!token) throw new VoiceCloneError('Sign in again to set up your voice.');
  return { 'x-dehub-token': token, 'x-wallet-address': wallet.toLowerCase() };
}

async function callJson<T>(wallet: string, action: string): Promise<T | null> {
  try {
    const headers = await authHeaders(wallet);
    const { data } = await supabase.functions.invoke(FUNCTION, { body: { action }, headers });
    const payload = data as (T & { error?: string }) | null;
    if (!payload || payload.error) return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** What this wallet owns, owes, or is owed. */
export function fetchVoiceCloneStatus(wallet: string): Promise<VoiceCloneStatus | null> {
  return callJson<VoiceCloneStatus>(wallet, 'status');
}

/** Switch dubbing on using a voice the wallet already has. Free. */
export function enableStageVoice(wallet: string): Promise<{ enabled: boolean; voiceName: string | null } | null> {
  return callJson<{ enabled: boolean; voiceName: string | null }>(wallet, 'enable');
}

/**
 * Switch dubbing off. The voice stays on the account — it was paid for — but
 * nothing speaks in it until it is switched back on.
 */
export function releaseStageVoice(wallet: string): Promise<{ enabled: boolean } | null> {
  return callJson<{ enabled: boolean }>(wallet, 'release');
}

/**
 * Upload the sample and claim the clone.
 *
 * `txHash` is omitted on a retry, which tells the server to spend the payment
 * it is already holding for this wallet.
 */
async function submit(
  wallet: string,
  file: File | null,
  name: string,
  txHash: string | null,
): Promise<VoiceCloneResult> {
  const headers = await authHeaders(wallet);

  const form = new FormData();
  // Absent when the wallet already has a voice: it is buying stage dubbing in
  // that voice, not another copy of it.
  if (file) form.append('file', file, file.name || 'stage-voice.webm');
  form.append('name', name);
  if (txHash) form.append('txHash', txHash);

  // Raw fetch rather than functions.invoke: this is multipart with our own
  // headers, which is the shape the invoke helper is least happy with. Same
  // call style VoiceTrainingDrawer already uses against the older clone route.
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION}`, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      ...headers,
    },
    body: form,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.error) {
    // From here the money is gone, so the message must never read as
    // "send it again".
    const paid = !!txHash || payload?.code === 'CLONE_FAILED';
    throw new VoiceCloneError(payload?.error || 'Voice cloning failed.', payload?.code, paid);
  }

  return {
    voiceId: String(payload.voiceId ?? ''),
    name: String(payload.name ?? name),
    charged: !!payload.charged,
    adopted: !!payload.adopted,
  };
}

/**
 * Set up the host's stage voice, paying for it if there is anything to pay.
 *
 * The order is deliberate: free-if-entitled, then spend-a-credit-if-held, and
 * only then ask the wallet for money. Every step before the transfer is a
 * chance not to charge someone.
 */
export async function purchaseStageVoice(
  wallet: string,
  file: File | null,
  name: string,
  status: VoiceCloneStatus,
): Promise<VoiceCloneResult> {
  // Paid before, or paid for one that never arrived — either way there is
  // nothing to transfer.
  if (status.entitled || status.creditedRetry) {
    return submit(wallet, file, name, null);
  }

  const { payDhb } = await import('@/lib/dhb-payment');
  const { txHash } = await payDhb(status.priceDhb, status.treasury, {
    context: 'Stage voice',
    expectedSigner: wallet,
    shortfallMessage: (amount, held) =>
      `Not enough DHB. Cloning your voice costs ${amount.toLocaleString()} DHB and you hold ${held.toLocaleString()}.`,
  });

  return submit(wallet, file, name, txHash);
}
