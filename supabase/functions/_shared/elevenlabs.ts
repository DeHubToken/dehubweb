/**
 * Shared ElevenLabs plumbing.
 * ===========================
 * The audio tools in the Creator Studio are nine separate edge functions
 * because they have nine different request shapes, but they all authenticate
 * the same way, fail the same way and need the same CORS headers. This is that
 * common part.
 *
 * The three functions that predate the studio (elevenlabs-tts,
 * elevenlabs-voices, elevenlabs-clone-voice) still inline their own copies.
 * They are deployed independently and rewriting a working, paid-for path to
 * share a helper buys nothing.
 */

import { byokErrorResponse, noteKeyResult } from './byok.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * The account key. Every one of these functions is useless without it, so they
 * all fail the same way rather than each inventing a message.
 */
export function getApiKey(): string | null {
  return Deno.env.get('ELEVENLABS_API_KEY') ?? null;
}

/**
 * A failed ElevenLabs answer on the creator's own key, turned into the
 * own-key error (and the key's status updated). Null when the failure is not
 * about their key, so the tool's usual error handling runs. The response body
 * is read from a clone, so the caller can still read the original.
 */
export async function ownElevenLabsFailure(wallet: string, response: Response): Promise<Response | null> {
  const body = (await response.clone().text().catch(() => '')).toLowerCase();
  if (body.includes('voice_not_found') || (response.status === 404 && body.includes('voice'))) {
    return jsonResponse({
      error: "That voice lives on Riftn's ElevenLabs account, so it can't run on your key. Pick one of your own voices, or remove your key in Settings to use Riftn's.",
      code: 'OWN_KEY_VOICE_NOT_FOUND', provider: 'elevenlabs', ownKey: true, canUseCredits: true,
    }, 400);
  }
  // ElevenLabs answers 401 with quota_exceeded when the account is out of credit.
  const status = body.includes('quota_exceeded') ? 402 : response.status;
  if (![401, 402, 403, 429].includes(status)) return null;
  await noteKeyResult(wallet, 'elevenlabs', status);
  return byokErrorResponse('elevenlabs', status);
}

/**
 * Pull the human-readable part out of an ElevenLabs error body.
 *
 * Their shape is `{ detail: { message } }` on most endpoints and a bare
 * `{ detail: "..." }` on others, so both are handled. Passing the provider's
 * own words through matters: "voice not found", "quota exceeded" and "file too
 * large" each need a different response from the creator, and collapsing them
 * into one generic failure told them nothing.
 */
export function readProviderError(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (typeof detail?.message === 'string' && detail.message) return detail.message;
    if (typeof parsed?.message === 'string' && parsed.message) return parsed.message;
  } catch {
    /* not JSON */
  }
  return fallback;
}

/** Clamp into range, falling back for anything non-numeric. */
export function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Forward an upstream audio body to the caller.
 *
 * These endpoints return raw bytes rather than JSON, and the client reads them
 * with fetch().blob() for exactly that reason.
 */
export function audioResponse(buffer: ArrayBuffer, contentType = 'audio/mpeg'): Response {
  return new Response(buffer, {
    headers: { ...corsHeaders, 'Content-Type': contentType },
  });
}

/**
 * Read the uploaded media off a multipart request.
 *
 * The four transformation tasks all post a file under the same field name, and
 * all of them must reject an empty upload here rather than paying to find out
 * upstream.
 */
export async function readUpload(
  req: Request,
  field = 'file',
): Promise<{ file: File; form: FormData } | null> {
  const form = await req.formData();
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  return { file, form };
}
