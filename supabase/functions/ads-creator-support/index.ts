import { guardPaidEndpoint, handleCorsPreflight, jsonResponse, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405);
  const auth = await guardPaidEndpoint(req, 'ads-creator-support', { limit: 720, windowMs: 3600000 });
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    if (typeof body.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.sessionId)
      || typeof body.playedSeconds !== 'number' || !Number.isFinite(body.playedSeconds)) {
      return jsonResponse({ error: 'A watch session and playback progress are required.' }, 400);
    }
    const { data, error } = await serviceClient().rpc('ads_advance_creator_support', {
      p_session: body.sessionId, p_viewer: auth.wallet, p_seconds: body.playedSeconds,
    });
    if (error) throw error;
    return jsonResponse(data, data?.error ? 400 : 200);
  } catch {
    return jsonResponse({ error: 'Could not record creator support. Retry without restarting the ad.' }, 503);
  }
});
