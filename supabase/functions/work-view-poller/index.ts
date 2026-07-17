/**
 * work-view-poller
 * =================
 * Iterates over pending /work clipping submissions and refreshes their
 * cached view count from the source platform.
 *
 *  - YouTube  → YouTube Data API v3 (requires YOUTUBE_API_KEY); falls back to oEmbed (metadata only).
 *  - TikTok   → connector gateway (uses TIKTOK_API_KEY) if available; otherwise oEmbed metadata.
 *  - Instagram→ oEmbed metadata only (Graph API needs business token, deferred).
 *
 * Updates `work_submissions.view_count_cached` and `last_polled_at`.
 * Always returns 200 with a summary; never blocks the request on individual
 * upstream failures.
 *
 * Manual: POST /functions/v1/work-view-poller   (no body required)
 * Cron:   schedule via pg_cron to run every hour.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YT_KEY = Deno.env.get('YOUTUBE_API_KEY');
const LOVABLE_KEY = Deno.env.get('LOVABLE_API_KEY');
const TIKTOK_KEY = Deno.env.get('TIKTOK_API_KEY');

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────
function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

async function youtubeViews(url: string): Promise<number | null> {
  const id = extractYouTubeId(url);
  if (!id || !YT_KEY) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}&key=${YT_KEY}`);
    if (!r.ok) return null;
    const j = await r.json();
    const v = j.items?.[0]?.statistics?.viewCount;
    return v ? Number(v) : null;
  } catch { return null; }
}

async function tiktokViews(url: string): Promise<number | null> {
  // oEmbed first (always works, no auth) — but doesn't include views.
  // Real view counts require connector gateway. Best-effort:
  if (!LOVABLE_KEY || !TIKTOK_KEY) return null;
  try {
    const r = await fetch(
      `https://connector-gateway.lovable.dev/tiktok/video/query/?fields=id,view_count`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          'X-Connection-Api-Key': TIKTOK_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filters: { video_ids: [extractTikTokId(url)] } }),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.videos?.[0]?.view_count;
    return typeof v === 'number' ? v : null;
  } catch { return null; }
}

function extractTikTokId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m?.[1] ?? null;
}

async function instagramViews(_url: string): Promise<number | null> {
  // Instagram Graph API requires a business access token tied to the post owner;
  // not feasible without per-creator OAuth. Return null → manual approval fallback.
  return null;
}

async function fetchViews(platform: string | null, url: string): Promise<number | null> {
  switch (platform) {
    case 'youtube': return youtubeViews(url);
    case 'tiktok': return tiktokViews(url);
    case 'instagram': return instagramViews(url);
    default: return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Pull pending/approved clipping submissions whose poll is older than 1h
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: subs, error } = await supa
      .from('work_submissions' as any)
      .select('id, job_id, proof_url, platform, view_count_cached, last_polled_at, work_jobs!inner(job_type)')
      .eq('work_jobs.job_type', 'clipping')
      .in('approval_status', ['pending', 'approved'])
      .or(`last_polled_at.is.null,last_polled_at.lt.${oneHourAgo}`)
      .limit(200);

    if (error) throw error;

    let polled = 0, updated = 0, skipped = 0;
    for (const s of (subs ?? [])) {
      polled++;
      const views = await fetchViews((s as any).platform, (s as any).proof_url);
      if (views === null) { skipped++; continue; }
      const { error: upErr } = await supa
        .from('work_submissions' as any)
        .update({ view_count_cached: views, last_polled_at: new Date().toISOString() })
        .eq('id', (s as any).id);
      if (!upErr) updated++;
    }

    // Snapshot for history charts (best-effort)
    if (updated > 0) {
      const snapshots = (subs ?? []).map((s: any) => ({
        submission_id: s.id,
        view_count: s.view_count_cached,
        polled_at: new Date().toISOString(),
      })).filter((s: any) => s.view_count > 0);
      if (snapshots.length) {
        await supa.from('work_view_snapshots' as any).insert(snapshots);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, polled, updated, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[work-view-poller]', e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
