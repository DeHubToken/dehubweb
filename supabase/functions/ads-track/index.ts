/**
 * ads-track
 * =========
 * Billing beacon. Accepts impression/click events ONLY when accompanied by a
 * valid, unexpired HMAC serve token issued by ads-serve. All pricing data is
 * sealed inside the token (server-signed), so clients can't set their own
 * prices, and UNIQUE (serve_id, event_type) in the DB makes each serve
 * billable at most once. Supports navigator.sendBeacon payloads.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse, verifyServeToken } from '../_shared/povr.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adsCorsHeaders });

  try {
    // sendBeacon may deliver text/plain — parse defensively.
    const raw = await req.text();
    let body: { token?: string; event?: string } = {};
    try { body = JSON.parse(raw); } catch { /* ignore */ }

    const event = body.event === 'click' ? 'click' : 'impression';
    const payload = body.token ? await verifyServeToken(body.token) : null;
    if (!payload) return jsonResponse({ error: 'invalid or expired token' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (event === 'impression') {
      const { data, error } = await supabase.rpc('ads_track_impression', {
        p_serve_id: payload.sid,
        p_campaign: payload.cam,
        p_creative: payload.cre,
        p_viewer_key: payload.vk,
        p_viewer_wallet: payload.vw || null,
        p_tier: payload.tier,
        p_surface: payload.sur,
        p_price: payload.p,
        p_share: payload.sh,
      });
      if (error) throw error;
      return jsonResponse(data ?? { ok: true });
    }

    const { data, error } = await supabase.rpc('ads_track_click', {
      p_serve_id: payload.sid,
      p_campaign: payload.cam,
      p_creative: payload.cre,
      p_viewer_key: payload.vk,
      p_viewer_wallet: payload.vw || null,
      p_tier: payload.tier,
      p_surface: payload.sur,
    });
    if (error) throw error;
    return jsonResponse(data ?? { ok: true });
  } catch (err) {
    console.error('[ads-track] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'track failed' }, 500);
  }
});
