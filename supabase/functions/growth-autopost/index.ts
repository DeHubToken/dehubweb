// Brand autopost: dehub's own social accounts post every day from live product
// data, through the same Zernio + Neynar integration multipost uses.
//
// Unlike multipost there is no wallet and no credit charge: posts go out from
// one configured brand Zernio profile and one brand Farcaster signer.
//
// Actions (POST, JSON body { action, ... }):
//   generate   cron, hourly. Builds candidate posts into growth_autopost_queue.
//   publish    cron, every 10 minutes. Posts approved items whose time has come.
//   list       admin. { status?, limit? } → { items, settings, brand }
//   update     admin. { id, text?, platforms?, scheduledFor? } edits a post not yet out.
//   approve    admin. { id }
//   skip       admin. { id }
//   settings   admin. { auto_approve?, enabled_kinds?, platforms?, daily_caps?, daily_total_cap?, live_min_audience? }
//
// Cron calls carry the vault key growth_autopost_scheduler_key (see the
// migration); everything else needs a godmode admin JWT. generate and publish
// also accept an admin with write access, for a manual run.
//
// Env: ZERNIO_API_KEY + ZERNIO_BRAND_PROFILE_ID for the Zernio platforms,
// NEYNAR_API_KEY + FARCASTER_BRAND_SIGNER_UUID for Farcaster. With neither
// configured, generate and publish do nothing and say so.

import { handleCorsPreflight, jsonResponse, serviceClient } from '../_shared/auth.ts';
import { AdminAuthError, requirePanelAdmin } from '../_shared/admin-auth.ts';
import { brandSignerUuid, publishCast } from '../_shared/farcaster.ts';
import { TEXT_LIMIT, clip, clipCastText } from '../_shared/social-text.ts';
import { ZERNIO_PLATFORMS, incompatibility, listZernioAccounts, platformExtras, zernio, type MediaItem, type ZAccount } from '../_shared/zernio.ts';
import {
  KINDS, type ApiPost, type BoardEntry, type Draft, type Kind, type LiveStreamRow, type StageRow,
  creatorOfDay, dhbUpdate, fitsPlatform, hasTokenId, growthPulse, isUnfeaturable, leaderboard, liveStream,
  shortsOfWeek, slotFor, stage, textsFor, utmLink,
} from './posts.ts';

const API = 'https://api.dehub.io/api';
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const BRAND_PLATFORMS: string[] = [...ZERNIO_PLATFORMS, 'farcaster'];

const READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'VIEWER'];
const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/** A live post loses its point fast: one not out within this long is skipped. */
const LIVE_STALE_MS = 2 * 3600_000;
/** Minimum spacing between live_now posts, on top of the daily cap. */
const LIVE_GAP_MS = 2 * 3600_000;
/** Posts sent per publish run, so one run stays well inside the function's time limit. */
const PUBLISH_PER_RUN = 3;

type Db = ReturnType<typeof serviceClient>;

interface Settings {
  auto_approve: boolean;
  enabled_kinds: string[];
  platforms: Record<string, string[]>;
  daily_caps: Record<string, number>;
  daily_total_cap: number;
  live_min_audience: number;
}

interface QueueRow {
  id: string;
  kind: Kind;
  platforms: string[];
  text: Record<string, string>;
  media: MediaItem[];
  link: string | null;
  source_ref: string;
  status: string;
  scheduled_for: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function brand() {
  const profileId = Deno.env.get('ZERNIO_API_KEY') ? (Deno.env.get('ZERNIO_BRAND_PROFILE_ID') || null) : null;
  const signer = brandSignerUuid();
  return { profileId, signer, configured: !!(profileId || signer) };
}

const NOT_CONFIGURED = {
  ok: false,
  configured: false,
  reason: 'Brand autopost is not configured: set ZERNIO_API_KEY and ZERNIO_BRAND_PROFILE_ID, or NEYNAR_API_KEY and FARCASTER_BRAND_SIGNER_UUID.',
};

async function getJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();

async function loadSettings(db: Db): Promise<Settings> {
  const { data, error } = await db.from('growth_autopost_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  return {
    auto_approve: !!data?.auto_approve,
    enabled_kinds: data?.enabled_kinds ?? [],
    platforms: data?.platforms ?? {},
    daily_caps: data?.daily_caps ?? {},
    daily_total_cap: Number(data?.daily_total_cap ?? 0),
    live_min_audience: Number(data?.live_min_audience ?? 50),
  };
}

// ── Sources ─────────────────────────────────────────────────────────────────

async function topPosts(sortBy: 'tips' | 'likes'): Promise<ApiPost[]> {
  const data = await getJson(`${API}/feed?sortBy=${sortBy}&sortOrder=desc&range=day&limit=15`);
  return Array.isArray(data?.result) ? data.result : [];
}

async function creatorCandidates(slot: Date): Promise<Draft[]> {
  const eligible = (posts: ApiPost[], key: 'totalTips' | 'likes') =>
    posts.filter(hasTokenId).filter((p) => !isUnfeaturable(p) && Number(p[key] ?? 0) > 0);
  let posts = eligible(await topPosts('tips'), 'totalTips');
  if (!posts.length) posts = eligible(await topPosts('likes'), 'likes');
  return posts.map((p) => creatorOfDay(p, slot));
}

async function boardWeek(db: Db, sort: string): Promise<BoardEntry[]> {
  const { data } = await db.from('leaderboard_cache').select('data').eq('sort_mode', sort).eq('period', 'week').maybeSingle();
  const rows = (data?.data as { result?: { byWalletBalance?: BoardEntry[] } } | null)?.result?.byWalletBalance;
  return Array.isArray(rows) ? rows : [];
}

async function dhbMarket() {
  const data = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${DHB_BASE}`);
  const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
  if (!pairs.length) return null;
  const main = [...pairs].sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0];
  const sum = (f: (p: any) => unknown) => pairs.reduce((s, p) => s + (Number(f(p)) || 0), 0);
  return {
    priceUsd: parseFloat(main.priceUsd),
    change24h: Number.isFinite(Number(main?.priceChange?.h24)) ? Number(main.priceChange.h24) : null,
    volume24h: sum((p) => p?.volume?.h24),
    liquidityUsd: sum((p) => p?.liquidity?.usd),
  };
}

async function liveCandidates(db: Db, settings: Settings, now: Date): Promise<Draft[]> {
  const { data: last } = await db.from('growth_autopost_queue').select('created_at').eq('kind', 'live_now')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (last && now.getTime() - new Date(last.created_at).getTime() < LIVE_GAP_MS) return [];

  const min = settings.live_min_audience;
  const fresh = now.getTime() - 90 * 60_000;
  const found: { audience: number; draft: Draft }[] = [];

  const live = await getJson(`${API}/live?limit=20`);
  const streams: LiveStreamRow[] = Array.isArray(live) ? live : Array.isArray(live?.result) ? live.result : [];
  for (const s of streams) {
    const followers = Number(s.account?.followers ?? 0);
    if (String(s.status).toUpperCase() !== 'LIVE' || !s.startedAt || new Date(s.startedAt).getTime() < fresh) continue;
    if (followers < min || isUnfeaturable(s)) continue;
    found.push({ audience: followers, draft: liveStream(s, now) });
  }

  const soon = new Date(now.getTime() + 60 * 60_000).toISOString();
  const { data: stages } = await db.from('audio_spaces')
    .select('id, short_id, title, host_username, status, scheduled_at, started_at, listener_count')
    .or(`and(status.eq.live,started_at.gte.${new Date(fresh).toISOString()}),and(status.eq.scheduled,scheduled_at.gte.${now.toISOString()},scheduled_at.lte.${soon})`)
    .limit(20);
  const scheduled = (stages ?? []).filter((s) => s.status === 'scheduled').map((s) => s.id);
  const reminders = new Map<string, number>();
  if (scheduled.length) {
    const { data: rows } = await db.from('stage_reminders').select('space_id').in('space_id', scheduled);
    for (const r of rows ?? []) reminders.set(r.space_id, (reminders.get(r.space_id) ?? 0) + 1);
  }
  for (const s of (stages ?? []) as (StageRow & { started_at?: string })[]) {
    if (isUnfeaturable({ title: s.title })) continue;
    // Reminders are a stronger signal than a passing listener, so a scheduled
    // stage needs a fifth of the audience a live one does.
    const audience = s.status === 'live' ? Number(s.listener_count ?? 0) : (reminders.get(s.id) ?? 0) * 5;
    if (audience < min) continue;
    const at = s.status === 'scheduled' && s.scheduled_at ? new Date(Math.max(now.getTime(), new Date(s.scheduled_at).getTime() - 10 * 60_000)) : now;
    found.push({ audience, draft: stage(s, at) });
  }

  // Biggest audience first; generate takes one per run.
  return found.sort((a, b) => b.audience - a.audience).map((f) => f.draft);
}

async function candidates(db: Db, kind: Kind, settings: Settings, now: Date): Promise<Draft[]> {
  if (kind === 'live_now') return liveCandidates(db, settings, now);
  const slot = slotFor(kind, now);
  if (!slot) return [];
  switch (kind) {
    case 'creator_of_day':
      return creatorCandidates(slot);
    case 'growth_pulse': {
      const stats = await getJson(`${API}/stats/users`);
      const draft = stats?.ok === false ? null : growthPulse(stats ?? {}, slot);
      return draft ? [draft] : [];
    }
    case 'leaderboard': {
      const [received, sent] = await Promise.all([boardWeek(db, 'receivedTips'), boardWeek(db, 'sentTips')]);
      const draft = leaderboard(received, sent, slot);
      return draft ? [draft] : [];
    }
    case 'dhb_update': {
      const market = await dhbMarket();
      const draft = market ? dhbUpdate(market, slot) : null;
      return draft ? [draft] : [];
    }
    case 'shorts_of_week': {
      const data = await getJson(`${API}/feed/shorts?sortBy=likes&range=week&limit=15`);
      const draft = shortsOfWeek(Array.isArray(data?.result) ? data.result : [], slot);
      return draft ? [draft] : [];
    }
  }
  return [];
}

// ── generate ────────────────────────────────────────────────────────────────

async function generate(db: Db, now = new Date()) {
  if (!brand().configured) return NOT_CONFIGURED;
  const settings = await loadSettings(db);
  const created: { id: string; kind: string; source_ref: string; status: string }[] = [];
  const errors: string[] = [];

  for (const kind of KINDS) {
    if (!settings.enabled_kinds.includes(kind)) continue;
    const cap = Number(settings.daily_caps[kind] ?? 1);
    if (cap <= 0) continue;
    const platforms = (settings.platforms[kind] ?? []).filter((p) => BRAND_PLATFORMS.includes(p));
    if (!platforms.length) continue;
    try {
      const { count } = await db.from('growth_autopost_queue').select('id', { count: 'exact', head: true })
        .eq('kind', kind).gte('created_at', startOfDay(now));
      // One live post per run; with LIVE_GAP_MS the brand never narrates every stream.
      let room = Math.min(cap - (count ?? 0), kind === 'live_now' ? 1 : Infinity);
      if (room <= 0) continue;

      for (const draft of await candidates(db, kind, settings, now)) {
        if (room <= 0) break;
        const { data, error } = await db.from('growth_autopost_queue').upsert({
          kind,
          platforms,
          text: textsFor(draft, platforms),
          media: draft.media,
          link: draft.link,
          source_ref: draft.sourceRef,
          status: settings.auto_approve ? 'approved' : 'pending_review',
          scheduled_for: draft.scheduledFor.toISOString(),
        }, { onConflict: 'kind,source_ref', ignoreDuplicates: true }).select('id, kind, source_ref, status');
        if (error) throw error;
        // An empty result is a duplicate: try the next candidate.
        if (data?.length) {
          created.push(...data);
          room--;
        }
      }
    } catch (err) {
      console.error(`[growth-autopost] generate ${kind}`, err);
      errors.push(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { ok: true, created, ...(errors.length ? { errors } : {}) };
}

// ── publish ─────────────────────────────────────────────────────────────────

interface PlatformResult { status: string; error?: string; url?: string; id?: string }

async function publishItem(item: QueueRow, accounts: ZAccount[], signer: string | null): Promise<Record<string, PlatformResult>> {
  const results: Record<string, PlatformResult> = {};
  const media = (Array.isArray(item.media) ? item.media : []).filter((m) => typeof m?.url === 'string' && m.url.startsWith('https://')).slice(0, 10);
  const textOf = (p: string) => String(item.text?.[p] ?? '').trim();

  const targets: { platform: string; entry: Record<string, unknown>; tiktok?: Record<string, unknown> }[] = [];
  for (const platform of item.platforms.filter((p) => p !== 'farcaster')) {
    const account = accounts.find((a) => a.platform === platform);
    if (!account) { results[platform] = { status: 'skipped', error: 'not_connected' }; continue; }
    const text = clip(textOf(platform), TEXT_LIMIT[platform]);
    const reason = text ? incompatibility(platform, media, text) : 'empty';
    if (reason) { results[platform] = { status: 'skipped', error: reason }; continue; }
    const extras = await platformExtras(platform, account._id, text);
    if (extras.skip) { results[platform] = { status: 'skipped', error: extras.skip }; continue; }
    targets.push({
      platform,
      entry: { platform, accountId: account._id, customContent: text, ...(extras.data ? { platformSpecificData: extras.data } : {}) },
      tiktok: extras.tiktok,
    });
  }

  if (targets.length) {
    const tiktokSettings = targets.find((t) => t.tiktok)?.tiktok;
    const res = await zernio('/posts', {
      method: 'POST',
      // The queue id doubles as the idempotency key, so a retried run cannot double-post.
      headers: { 'x-request-id': item.id },
      body: JSON.stringify({
        content: targets[0].entry.customContent,
        mediaItems: media,
        platforms: targets.map((t) => t.entry),
        ...(tiktokSettings ? { tiktokSettings } : {}),
        publishNow: true,
      }),
    });
    const post = res.data?.post;
    if ((res.status >= 300 && res.status !== 207) || !post) {
      for (const t of targets) results[t.platform] = { status: 'failed', error: res.data?.error || 'Zernio rejected the post' };
    } else {
      for (const p of post.platforms ?? []) {
        results[p.platform] = {
          status: p.status === 'failed' ? 'failed' : 'posted',
          ...(p.errorMessage ? { error: p.errorMessage } : {}),
          ...(p.platformPostUrl ? { url: p.platformPostUrl } : {}),
        };
      }
      for (const t of targets) results[t.platform] ??= { status: 'posted' };
    }
  }

  if (item.platforms.includes('farcaster')) {
    const text = clipCastText(textOf('farcaster'));
    if (!signer) results.farcaster = { status: 'skipped', error: 'not_connected' };
    else if (!text) results.farcaster = { status: 'skipped', error: 'empty' };
    else {
      const embeds = [item.link ? utmLink(item.link, 'farcaster', item.kind) : '', media[0]?.url ?? ''].filter(Boolean);
      const cast = await publishCast(signer, text, embeds);
      results.farcaster = cast.ok ? { status: 'posted', id: cast.hash } : { status: 'failed', error: cast.error };
    }
  }
  return results;
}

async function publish(db: Db, now = new Date()) {
  const cfg = brand();
  if (!cfg.configured) return NOT_CONFIGURED;
  const settings = await loadSettings(db);

  // Live posts that missed their moment are dropped rather than sent late.
  await db.from('growth_autopost_queue').update({ status: 'skipped', results: { reason: 'stale' }, updated_at: now.toISOString() })
    .eq('kind', 'live_now').in('status', ['pending_review', 'approved'])
    .lt('scheduled_for', new Date(now.getTime() - LIVE_STALE_MS).toISOString());
  // A run that died mid-publish leaves its row held; after an hour it is
  // marked failed for an admin to look at, never silently re-sent.
  await db.from('growth_autopost_queue').update({ status: 'failed', results: { reason: 'interrupted' }, updated_at: now.toISOString() })
    .eq('status', 'publishing').lt('updated_at', new Date(now.getTime() - 3600_000).toISOString());

  const { count: postedToday } = await db.from('growth_autopost_queue').select('id', { count: 'exact', head: true })
    .eq('status', 'posted').gte('posted_at', startOfDay(now));
  let room = settings.daily_total_cap - (postedToday ?? 0);
  if (room <= 0) return { ok: true, published: [], reason: 'daily_cap' };

  const { data: due, error } = await db.from('growth_autopost_queue').select('*').eq('status', 'approved')
    .lte('scheduled_for', now.toISOString()).order('scheduled_for').limit(Math.min(room, PUBLISH_PER_RUN));
  if (error) throw error;
  if (!due?.length) return { ok: true, published: [] };

  const accounts = cfg.profileId ? await listZernioAccounts(cfg.profileId) : [];
  const published: { id: string; status: string; results: Record<string, PlatformResult> }[] = [];
  for (const item of due as QueueRow[]) {
    if (room <= 0) break;
    // Claim it, so an overlapping run cannot send it as well.
    const { data: claimed } = await db.from('growth_autopost_queue').update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', item.id).eq('status', 'approved').select('id');
    if (!claimed?.length) continue;

    let results: Record<string, PlatformResult>;
    try {
      results = await publishItem(item, accounts, cfg.signer);
    } catch (err) {
      results = { _error: { status: 'failed', error: err instanceof Error ? err.message : String(err) } };
    }
    const sent = Object.values(results).some((r) => r.status === 'posted');
    const status = sent ? 'posted' : 'failed';
    await db.from('growth_autopost_queue').update({
      status,
      results,
      posted_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    published.push({ id: item.id, status, results });
    if (sent) room--;
  }
  return { ok: true, published };
}

// ── Admin ───────────────────────────────────────────────────────────────────

async function brandAccounts() {
  const cfg = brand();
  let connected: string[] = [];
  let error: string | undefined;
  if (cfg.profileId) {
    try {
      connected = [...new Set((await listZernioAccounts(cfg.profileId)).map((a) => a.platform))];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  if (cfg.signer) connected.push('farcaster');
  return { configured: cfg.configured, zernio: !!cfg.profileId, farcaster: !!cfg.signer, connected, ...(error ? { error } : {}) };
}

async function getRow(db: Db, id: string): Promise<QueueRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Invalid id');
  const { data, error } = await db.from('growth_autopost_queue').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Post not found');
  return data as QueueRow;
}

async function setStatus(db: Db, id: string, to: string, from: string[], by: string) {
  const row = await getRow(db, id);
  if (!from.includes(row.status)) throw new HttpError(409, `A ${row.status.replace('_', ' ')} post cannot be changed`);
  const { data, error } = await db.from('growth_autopost_queue')
    .update({ status: to, reviewed_by: by, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', row.status).select('*');
  if (error) throw error;
  if (!data?.length) throw new HttpError(409, 'The post changed while you were editing it');
  return data[0];
}

async function updateItem(db: Db, body: any, by: string) {
  const row = await getRow(db, String(body.id ?? ''));
  if (!['pending_review', 'approved', 'failed'].includes(row.status)) throw new HttpError(409, `A ${row.status} post cannot be edited`);
  const patch: Record<string, unknown> = { reviewed_by: by, updated_at: new Date().toISOString() };

  const platforms: string[] = Array.isArray(body.platforms) ? [...new Set(body.platforms.map(String))] as string[] : row.platforms;
  const unknown = platforms.filter((p) => !BRAND_PLATFORMS.includes(p));
  if (unknown.length) throw new HttpError(400, `Unknown platform: ${unknown.join(', ')}`);
  if (!platforms.length) throw new HttpError(400, 'Pick at least one platform');

  const text: Record<string, string> = { ...row.text };
  if (body.text && typeof body.text === 'object') {
    for (const [p, t] of Object.entries(body.text)) {
      if (!BRAND_PLATFORMS.includes(p)) throw new HttpError(400, `Unknown platform: ${p}`);
      text[p] = String(t ?? '').trim();
    }
  }
  for (const p of platforms) {
    if (!text[p]) throw new HttpError(400, `No text for ${p}`);
    if (!fitsPlatform(p, text[p])) {
      throw new HttpError(400, p === 'farcaster' ? 'Farcaster text is over 320 bytes' : `${p} text is over ${TEXT_LIMIT[p]} characters`);
    }
  }
  patch.platforms = platforms;
  patch.text = text;

  if (body.scheduledFor !== undefined) {
    const at = new Date(body.scheduledFor);
    if (Number.isNaN(at.getTime())) throw new HttpError(400, 'Invalid schedule time');
    patch.scheduled_for = at.toISOString();
  }
  if (row.status === 'failed') patch.status = 'pending_review';

  const { data, error } = await db.from('growth_autopost_queue').update(patch).eq('id', row.id).eq('status', row.status).select('*');
  if (error) throw error;
  if (!data?.length) throw new HttpError(409, 'The post changed while you were editing it');
  return data[0];
}

async function saveSettings(db: Db, body: any, by: string) {
  const patch: Record<string, unknown> = { updated_by: by, updated_at: new Date().toISOString() };
  if (body.auto_approve !== undefined) patch.auto_approve = body.auto_approve === true;
  if (body.enabled_kinds !== undefined) {
    if (!Array.isArray(body.enabled_kinds)) throw new HttpError(400, 'enabled_kinds must be a list');
    patch.enabled_kinds = KINDS.filter((k) => body.enabled_kinds.includes(k));
  }
  if (body.platforms !== undefined) {
    if (!body.platforms || typeof body.platforms !== 'object') throw new HttpError(400, 'platforms must be an object');
    patch.platforms = Object.fromEntries(KINDS.map((k) => [k, (Array.isArray(body.platforms[k]) ? body.platforms[k] : [])
      .map(String).filter((p: string) => BRAND_PLATFORMS.includes(p))]));
  }
  if (body.daily_caps !== undefined) {
    if (!body.daily_caps || typeof body.daily_caps !== 'object') throw new HttpError(400, 'daily_caps must be an object');
    patch.daily_caps = Object.fromEntries(KINDS.map((k) => [k, Math.max(0, Math.min(24, Math.floor(Number(body.daily_caps[k] ?? 0)) || 0))]));
  }
  if (body.daily_total_cap !== undefined) patch.daily_total_cap = Math.max(0, Math.min(100, Math.floor(Number(body.daily_total_cap)) || 0));
  if (body.live_min_audience !== undefined) patch.live_min_audience = Math.max(0, Math.floor(Number(body.live_min_audience)) || 0);

  const { error } = await db.from('growth_autopost_settings').update(patch).eq('id', true);
  if (error) throw error;
  return loadSettings(db);
}

// ── Routing ─────────────────────────────────────────────────────────────────

async function isScheduler(db: Db, req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^bearer\s+/i, '');
  if (!token) return false;
  const { data, error } = await db.rpc('growth_autopost_scheduler_authorized', { p_token: token });
  return !error && data === true;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? '');
  const db = serviceClient();

  try {
    if (action === 'generate' || action === 'publish') {
      if (!(await isScheduler(db, req))) await requirePanelAdmin(req, WRITE_ROLES);
      return jsonResponse(action === 'generate' ? await generate(db) : await publish(db));
    }

    const admin = await requirePanelAdmin(req, READ_ROLES);
    const canWrite = WRITE_ROLES.includes(admin.role);
    const by = admin.email || admin.id;

    if (action === 'list') {
      const limit = Math.min(200, Math.max(1, Math.floor(Number(body.limit ?? 50)) || 50));
      let query = db.from('growth_autopost_queue').select('*').order('created_at', { ascending: false }).limit(limit);
      if (typeof body.status === 'string' && body.status !== 'all') query = query.eq('status', body.status);
      const [{ data: items, error }, settings, accounts] = await Promise.all([query, loadSettings(db), brandAccounts()]);
      if (error) throw error;
      return jsonResponse({
        items: items ?? [],
        settings,
        brand: accounts,
        kinds: KINDS,
        platforms: BRAND_PLATFORMS,
        textLimits: { ...TEXT_LIMIT, farcaster: 320 },
        canWrite,
      });
    }

    if (!canWrite) throw new HttpError(403, 'Your role cannot change autoposts');
    if (action === 'update') return jsonResponse({ item: await updateItem(db, body, by) });
    if (action === 'approve') return jsonResponse({ item: await setStatus(db, String(body.id ?? ''), 'approved', ['pending_review', 'failed', 'skipped'], by) });
    if (action === 'skip') return jsonResponse({ item: await setStatus(db, String(body.id ?? ''), 'skipped', ['pending_review', 'approved', 'failed'], by) });
    if (action === 'settings') return jsonResponse({ settings: await saveSettings(db, body, by) });

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    if (err instanceof HttpError || err instanceof AdminAuthError) return jsonResponse({ error: err.message }, err.status);
    console.error('[growth-autopost]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'growth-autopost failed' }, 500);
  }
});
