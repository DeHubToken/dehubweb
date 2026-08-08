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

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
