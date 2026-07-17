/**
 * ads-serve
 * =========
 * Ad decision engine. Given a viewer (wallet or anonymous id), a surface and
 * optional contextual categories, returns up to `count` eligible ads shaped
 * for native feed rendering, each carrying an HMAC-signed serve token that
 * ads-track requires before billing an impression or logging a click.
 *
 * Eligibility pipeline (all real data, no mocks):
 *   status=active + schedule window + total budget remaining
 *   + advertiser account balance > 0
 *   + daily pacing (today's rolled-up spend < daily budget)
 *   + per-viewer frequency cap
 *   + POVR targeting: badge tier (leaderboard_snapshots), follower band,
 *     language (user_display_preferences), premium, community membership,
 *     behaviors (tips / PPV / staking / streaming), followers-of-creator
 *     (materialized ad_audience_members), contextual categories
 *   + never serve an advertiser their own campaign
 * Pricing: viewer-tier CPM (POVR) — computed here, sealed inside the token.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  adsCorsHeaders,
  impressionPriceUsd,
  jsonResponse,
  signServeToken,
  tierForBalance,
} from '../_shared/povr.ts';

interface ServeRequest {
  viewerWallet?: string;
  anonId?: string;
  surface?: string;
  categories?: string[];
  count?: number;
  excludeCampaigns?: string[];
}

interface Targeting {
  tiers?: string[];
  followerMin?: number;
  followerMax?: number;
  languages?: string[];
  premium?: boolean;
  communities?: string[];
  behaviors?: string[];
  categories?: string[];
  followedCreators?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adsCorsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as ServeRequest;
    const surface = (body.surface || 'home').slice(0, 32);
    const count = Math.min(Math.max(body.count ?? 2, 1), 6);
    const wallet = (body.viewerWallet || '').toLowerCase();
    const viewerKey = wallet || `anon:${(body.anonId || 'unknown').slice(0, 64)}`;
    const reqCategories = (body.categories || []).map((c) => c.toLowerCase());

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---- viewer snapshot (tier + followers) --------------------------------
    let viewerBalance = 0;
    let viewerFollowers = 0;
    if (wallet) {
      const { data: snap } = await supabase
        .from('leaderboard_snapshots')
        .select('balance, followers')
        .eq('account', wallet)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      viewerBalance = Number(snap?.balance ?? 0);
      viewerFollowers = Number(snap?.followers ?? 0);
    }
    const viewerTier = tierForBalance(viewerBalance);

    // ---- candidate campaigns ----------------------------------------------
    const nowIso = new Date().toISOString();
    const { data: campaigns, error: campErr } = await supabase
      .from('ad_campaigns')
      .select('id, wallet_address, name, status, daily_budget_usd, total_budget_usd, spent_usd, start_at, end_at, targeting, frequency_cap, cta_url')
      .eq('status', 'active')
      .lte('start_at', nowIso)
      .limit(200);
    if (campErr) throw campErr;

    const exclude = new Set((body.excludeCampaigns || []).map(String));
    let candidates = (campaigns || []).filter((c) =>
      !exclude.has(c.id) &&
      (!c.end_at || new Date(c.end_at) > new Date()) &&
      Number(c.spent_usd) < Number(c.total_budget_usd) &&
      c.wallet_address !== wallet // never bill advertisers for their own views
    );
    if (candidates.length === 0) return jsonResponse({ ads: [] });

    // ---- advertiser balances ----------------------------------------------
    const owners = [...new Set(candidates.map((c) => c.wallet_address))];
    const { data: accounts } = await supabase
      .from('ad_accounts')
      .select('wallet_address, balance_usd, status, company_name')
      .in('wallet_address', owners);
    const accountByWallet = new Map((accounts || []).map((a) => [a.wallet_address, a]));
    candidates = candidates.filter((c) => {
      const acc = accountByWallet.get(c.wallet_address);
      return acc && acc.status === 'active' && Number(acc.balance_usd) > 0;
    });
    if (candidates.length === 0) return jsonResponse({ ads: [] });

    const ids = candidates.map((c) => c.id);
    const today = new Date().toISOString().slice(0, 10);

    // ---- daily pacing + frequency caps (batched) ---------------------------
    const [{ data: statRows }, { data: freqRows }] = await Promise.all([
      supabase.from('ad_daily_stats').select('campaign_id, spend_usd').in('campaign_id', ids).eq('day', today),
      supabase.from('ad_frequency').select('campaign_id, impressions').eq('viewer_key', viewerKey).eq('day', today).in('campaign_id', ids),
    ]);
    const spendToday = new Map<string, number>();
    for (const r of statRows || []) {
      spendToday.set(r.campaign_id, (spendToday.get(r.campaign_id) || 0) + Number(r.spend_usd));
    }
    const freqToday = new Map<string, number>(
      (freqRows || []).map((r) => [r.campaign_id, Number(r.impressions)]),
    );

    candidates = candidates.filter((c) => {
      if ((spendToday.get(c.id) || 0) >= Number(c.daily_budget_usd)) return false;
      if ((freqToday.get(c.id) || 0) >= Number(c.frequency_cap || 4)) return false;
      return true;
    });
    if (candidates.length === 0) return jsonResponse({ ads: [] });

    // ---- viewer-scoped targeting lookups (lazy, each fetched at most once) --
    const needs = (pick: (t: Targeting) => boolean) =>
      candidates.some((c) => pick((c.targeting || {}) as Targeting));

    let viewerLanguage: string | null | undefined;
    if (wallet && needs((t) => !!t.languages?.length)) {
      const { data } = await supabase
        .from('user_display_preferences')
        .select('preferences')
        .ilike('wallet_address', wallet)
        .limit(1)
        .maybeSingle();
      viewerLanguage = (data?.preferences as Record<string, unknown> | null)?.['language'] as string | undefined;
    }

    let viewerPremium: boolean | undefined;
    if (wallet && needs((t) => t.premium === true)) {
      const { data } = await supabase
        .from('premium_subscriptions')
        .select('id')
        .ilike('wallet_address', wallet)
        .in('status', ['active', 'trialing'])
        .limit(1);
      viewerPremium = !!data?.length;
    }

    let viewerCommunities: Set<string> | undefined;
    if (wallet && needs((t) => !!t.communities?.length)) {
      const { data } = await supabase
        .from('community_members')
        .select('community_id')
        .ilike('wallet_address', wallet)
        .eq('status', 'active');
      viewerCommunities = new Set((data || []).map((r) => String(r.community_id)));
    }

    const behaviorCache = new Map<string, boolean>();
    const hasBehavior = async (behavior: string): Promise<boolean> => {
      if (!wallet) return false;
      if (behaviorCache.has(behavior)) return behaviorCache.get(behavior)!;
      let ok = false;
      if (behavior === 'tippers') {
        const { data } = await supabase.from('tip_records').select('id').ilike('sender_address', wallet).limit(1);
        ok = !!data?.length;
      } else if (behavior === 'ppv_buyers') {
        const { data } = await supabase.from('ppv_purchases').select('id').ilike('buyer_address', wallet).limit(1);
        ok = !!data?.length;
      } else if (behavior === 'stakers') {
        const { data } = await supabase.from('staking_records').select('id').ilike('wallet_address', wallet).eq('action', 'stake').limit(1);
        ok = !!data?.length;
      } else if (behavior === 'streamers') {
        const { data } = await supabase.from('live_stream_sessions').select('id').ilike('address', wallet).limit(1);
        ok = !!data?.length;
      }
      behaviorCache.set(behavior, ok);
      return ok;
    };

    let audienceMemberships: Set<string> | undefined;
    const audienceCampaigns = candidates
      .filter((c) => ((c.targeting || {}) as Targeting).followedCreators?.length)
      .map((c) => c.id);
    if (wallet && audienceCampaigns.length) {
      const { data } = await supabase
        .from('ad_audience_members')
        .select('campaign_id')
        .eq('wallet_address', wallet)
        .in('campaign_id', audienceCampaigns);
      audienceMemberships = new Set((data || []).map((r) => String(r.campaign_id)));
    }

    // ---- apply targeting ----------------------------------------------------
    const eligible: typeof candidates = [];
    for (const c of candidates) {
      const t = (c.targeting || {}) as Targeting;

      if (t.tiers?.length && !t.tiers.includes(viewerTier)) continue;
      if (typeof t.followerMin === 'number' && viewerFollowers < t.followerMin) continue;
      if (typeof t.followerMax === 'number' && viewerFollowers > t.followerMax) continue;
      if (t.languages?.length && (!viewerLanguage || !t.languages.includes(viewerLanguage))) continue;
      if (t.premium === true && !viewerPremium) continue;
      if (t.communities?.length) {
        if (!viewerCommunities || !t.communities.some((id) => viewerCommunities!.has(String(id)))) continue;
      }
      if (t.followedCreators?.length) {
        if (!audienceMemberships?.has(c.id)) continue;
      }
      if (t.categories?.length && reqCategories.length) {
        const wanted = t.categories.map((x) => x.toLowerCase());
        if (!wanted.some((w) => reqCategories.includes(w))) continue;
      }
      if (t.behaviors?.length) {
        let all = true;
        for (const b of t.behaviors) {
          if (!(await hasBehavior(b))) { all = false; break; }
        }
        if (!all) continue;
      }

      eligible.push(c);
    }
    if (eligible.length === 0) return jsonResponse({ ads: [] });

    // ---- approved creatives --------------------------------------------------
    const { data: creatives } = await supabase
      .from('ad_creatives')
      .select('id, campaign_id, kind, media_url, thumbnail_url, headline, body, cta_label, cta_url, width, height, duration_seconds')
      .in('campaign_id', eligible.map((c) => c.id))
      .eq('status', 'approved');
    const creativesByCampaign = new Map<string, NonNullable<typeof creatives>>();
    for (const cr of creatives || []) {
      const list = creativesByCampaign.get(cr.campaign_id) || [];
      list.push(cr);
      creativesByCampaign.set(cr.campaign_id, list);
    }
    const servable = eligible.filter((c) => creativesByCampaign.get(c.id)?.length);
    if (servable.length === 0) return jsonResponse({ ads: [] });

    // ---- weighted selection (remaining daily budget = pacing fairness) -------
    const pool = servable.map((c) => ({
      c,
      weight: Math.max(Number(c.daily_budget_usd) - (spendToday.get(c.id) || 0), 0.01),
    }));
    const picked: typeof servable = [];
    while (picked.length < count && pool.length > 0) {
      const total = pool.reduce((s, p) => s + p.weight, 0);
      let roll = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight;
        if (roll <= 0) { idx = i; break; }
      }
      picked.push(pool[idx].c);
      pool.splice(idx, 1);
    }

    // ---- viewer revenue share config ----------------------------------------
    let shareBps = 5000;
    let ttlSeconds = 1800;
    const { data: cfgRows } = await supabase
      .from('ad_config')
      .select('key, value')
      .in('key', ['viewer_share_bps', 'serve_token_ttl_seconds']);
    for (const row of cfgRows || []) {
      if (row.key === 'viewer_share_bps') shareBps = Number(row.value) || shareBps;
      if (row.key === 'serve_token_ttl_seconds') ttlSeconds = Number(row.value) || ttlSeconds;
    }

    const price = impressionPriceUsd(viewerTier);
    const share = wallet ? Math.round(price * shareBps) / 10000 : 0; // bps → usd, 6dp-safe
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

    const ads = await Promise.all(picked.map(async (c) => {
      const options = creativesByCampaign.get(c.id)!;
      const creative = options[Math.floor(Math.random() * options.length)];
      const serveId = crypto.randomUUID();
      const token = await signServeToken({
        sid: serveId,
        cam: c.id,
        cre: creative.id,
        vk: viewerKey,
        vw: wallet,
        tier: viewerTier,
        sur: surface,
        p: price,
        sh: share,
        exp,
      });
      const account = accountByWallet.get(c.wallet_address);
      return {
        serveId,
        token,
        campaignId: c.id,
        creativeId: creative.id,
        kind: creative.kind,
        mediaUrl: creative.media_url,
        thumbnailUrl: creative.thumbnail_url,
        headline: creative.headline,
        body: creative.body,
        ctaLabel: creative.cta_label || 'Learn more',
        ctaUrl: creative.cta_url || c.cta_url || null,
        advertiser: account?.company_name || `${c.wallet_address.slice(0, 6)}…${c.wallet_address.slice(-4)}`,
        width: creative.width,
        height: creative.height,
        durationSeconds: creative.duration_seconds,
      };
    }));

    return jsonResponse({ ads });
  } catch (err) {
    console.error('[ads-serve] error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'serve failed' }, 500);
  }
});
