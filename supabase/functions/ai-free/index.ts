// How many free starter images the signed-in wallet has left, and which
// models they run on. The claim itself happens in chargeForJob.
import { handleCorsPreflight, jsonResponse, requireDeHubAuth } from '../_shared/auth.ts';
import { FREE_IMAGE_LIMIT, FREE_IMAGE_MODELS, freeRemaining } from '../_shared/ai-free.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  try {
    const remaining = await freeRemaining(auth.wallet);
    return jsonResponse({ remaining, limit: FREE_IMAGE_LIMIT, models: FREE_IMAGE_MODELS });
  } catch (error) {
    console.error('[ai-free]', error);
    return jsonResponse({ error: 'Could not read your free images.' }, 503);
  }
});
