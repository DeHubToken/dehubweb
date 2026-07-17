/**
 * ads-admin
 * =========
 * Review queue backend for the /admin/ads page. Auth = DeHub ADMIN bearer
 * token (the same email/password admin system as /admin/users), validated
 * against the DeHub API before any service-role write. Wallet-header RLS
 * can't express "is admin" (headers are client-controlled), so moderation
 * lives here behind real admin auth.
 *
 * GET  ?action=queue                 → pending campaigns + creatives
 * POST {type:'campaign'|'creative', id, action:'approve'|'reject', note?}
 * POST {action:'refresh_audience', campaignId}
 *      → (re)materialize followers-of-creator audiences from the DeHub API
 *
 * Approving a campaign whose targeting includes followedCreators triggers
 * audience materialization automatically.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';

const DEHUB_API_BASE = 'https://api.dehub.io';
const MAX_FOLLOWER_PAGES = 50; // 50 x 100 = 5k followers per creator cap
const FOLLOWER_PAGE_SIZE = 100;

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/admin/users?page=1&limit=1`, {
      headers: { Authorization: authHeader },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchFollowers(creator: string): Promise<string[]> {
  const wallets: string[] = [];
  for (let page = 1; page <= MAX_FOLLOWER_PAGES; page++) {
    try {
      const res = await fetch(
        `${DEHUB_API_BASE}/api/follow_list/${creator}?type=followers&page=${page}&limit=${FOLLOWER_PAGE_SIZE}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) break;
      const json = await res.json();
      const items: Array<{ address?: string }> = Array.isArray(json) ? json : (json?.data ?? json?.result ?? json?.list ?? []);
      if (!Array.isArray(items) || items.length === 0) break;
      for (const item of items) {
        if (item?.address && /^0x[a-fA-F0-9]{40}$/.test(item.address)) {
          wallets.push(item.address.toLowerCase());
        }
      }
      if (items.length < FOLLOWER_PAGE_SIZE) break;
    } catch (err) {
      console.error(`[ads-admin] follow_list page ${page} failed for ${creator}:`, err);
      break;
    }
  }
  return wallets;
}

// deno-lint-ignore no-explicit-any
async function refreshAudience(supabase: any, campaignId: string): Promise<{ members: number; creators: number }> {
  const { data: campaign, error } = await supabase
    .from('ad_campaigns')
    .select('id, targeting')
    .eq('id', campaignId)
    .maybeSingle();
  if (error || !campaign) throw new Error('campaign not found');

  const creators: string[] = ((campaign.targeting?.followedCreators as string[]) || [])
    .filter((w) => /^0x[a-fA-F0-9]{40}$/.test(w))
    .map((w) => w.toLowerCase());
  if (creators.length === 0) return { members: 0, creators: 0 };

  const members = new Map<string, string>(); // wallet -> source creator
  for (const creator of creators) {
    const followers = await fetchFollowers(creator);
    for (const f of followers) {
      if (!members.has(f)) members.set(f, `follower_of:${creator}`);
    }
  }

  // Replace the audience wholesale (idempotent refresh).
  await supabase.from('ad_audience_members').delete().eq('campaign_id', campaignId);
  const rows = [...members.entries()].map(([wallet_address, source]) => ({
    campaign_id: campaignId,
    wallet_address,
    source,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insErr } = await supabase.from('ad_audience_members').insert(rows.slice(i, i + 500));
    if (insErr) throw insErr;
  }
  console.log(`[ads-admin] audience refresh ${campaignId}: ${rows.length} members from ${creators.length} creators`);
  return { members: rows.length, creators: creators.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adsCorsHeaders });

  try {
    if (!(await isAdmin(req.headers.get('Authorization')))) {
      return jsonResponse({ error: 'admin authorization required' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action') || 'queue';
      if (action !== 'queue') return jsonResponse({ error: 'unknown action' }, 400);

      const [{ data: campaigns }, { data: creatives }] = await Promise.all([
        supabase
          .from('ad_campaigns')
          .select('id, wallet_address, name, objective, status, daily_budget_usd, total_budget_usd, start_at, end_at, targeting, frequency_cap, cta_url, created_at')
          .eq('status', 'pending_review')
          .order('created_at', { ascending: true }),
        supabase
          .from('ad_creatives')
          .select('id, campaign_id, wallet_address, kind, media_url, thumbnail_url, headline, body, cta_label, cta_url, status, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
      ]);

      // Attach campaign context to orphan-pending creatives (edited after approval).
      const campaignIds = [...new Set((creatives || []).map((c) => c.campaign_id))];
      let creativeCampaigns: Record<string, { id: string; name: string; status: string }> = {};
      if (campaignIds.length) {
        const { data } = await supabase
          .from('ad_campaigns')
          .select('id, name, status')
          .in('id', campaignIds);
        creativeCampaigns = Object.fromEntries((data || []).map((c) => [c.id, c]));
      }

      return jsonResponse({
        campaigns: campaigns || [],
        creatives: (creatives || []).map((c) => ({ ...c, campaign: creativeCampaigns[c.campaign_id] || null })),
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();

      if (body.action === 'refresh_audience') {
        if (!body.campaignId) return jsonResponse({ error: 'campaignId required' }, 400);
        const result = await refreshAudience(supabase, body.campaignId);
        return jsonResponse({ ok: true, ...result });
      }

      const { type, id, action, note } = body as {
        type: 'campaign' | 'creative';
        id: string;
        action: 'approve' | 'reject';
        note?: string;
      };
      if (!id || !['campaign', 'creative'].includes(type) || !['approve', 'reject'].includes(action)) {
        return jsonResponse({ error: 'type, id and action required' }, 400);
      }

      if (type === 'campaign') {
        const update = action === 'approve'
          ? { status: 'active', approved_at: new Date().toISOString(), review_note: note || null }
          : { status: 'rejected', review_note: note || 'Rejected by moderation' };
        const { data, error } = await supabase
          .from('ad_campaigns')
          .update(update)
          .eq('id', id)
          .eq('status', 'pending_review')
          .select('id, targeting')
          .maybeSingle();
        if (error) throw error;
        if (!data) return jsonResponse({ error: 'campaign not in review queue' }, 404);

        let audience: { members: number; creators: number } | undefined;
        if (action === 'approve' && (data.targeting?.followedCreators as string[] | undefined)?.length) {
          try {
            audience = await refreshAudience(supabase, id);
          } catch (err) {
            console.error('[ads-admin] audience refresh after approve failed:', err);
          }
        }
        return jsonResponse({ ok: true, audience });
      }

      const update = action === 'approve'
        ? { status: 'approved', review_note: note || null }
        : { status: 'rejected', review_note: note || 'Rejected by moderation' };
      const { data, error } = await supabase
        .from('ad_creatives')
        .update(update)
        .eq('id', id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: 'creative not in review queue' }, 404);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'method not allowed' }, 405);
  } catch (err) {
    console.error('[ads-admin] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'admin action failed' }, 500);
  }
});
