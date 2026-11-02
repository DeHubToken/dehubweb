/**
 * miniapp-admin
 * =============
 * The mini app review queue behind the admin hub's "Mini apps" page.
 *
 * GET  ?view=queue|listed|rejected|suspended|all
 *   → apps: the apps in that view, newest submission first
 * POST { action, slug, note? }
 *   approve  → tier listed, shows in the store
 *   verify   → tier verified (listed + the verified tick)
 *   reject   → stays an unlisted link, developer sees the reason on /apps/dev
 *   unlist   → back to an unlisted link (no review state change)
 *   suspend  → app stops opening anywhere (status suspended)
 *   restore  → undo a suspension (status live)
 *
 * Every decision lands in the developer's notifications (type 'miniapp', so a
 * tap opens /apps/<slug>). Callers are checked against api.dehub.io
 * `GET /api/admin/me`, the same bridge the other admin functions use.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';

const DEHUB_API_BASE = 'https://api.dehub.io';
const REVIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);
const ZERO = '0x0000000000000000000000000000000000000000';

const COLUMNS =
  'id, slug, domain, home_url, name, subtitle, description, icon_url, splash_image_url, category, tags, permissions, ' +
  'tier, status, source, owner_wallet, submitted_by, review_state, review_note, submitted_at, reviewed_at, reviewed_by, created_at, updated_at';

interface Reviewer { name: string }

async function reviewer(authHeader: string | null): Promise<Reviewer | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/admin/me`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const admin = json?.admin ?? json?.data?.admin ?? json;
    if (admin?.isActive === false) return null;
    if (!REVIEW_ROLES.has(String(admin?.role ?? '').toUpperCase())) return null;
    return { name: String(admin?.username ?? admin?.email ?? admin?.name ?? 'admin').slice(0, 80) };
  } catch {
    return null;
  }
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function list(db: Db, view: string) {
  let q = db.from('miniapp_apps').select(COLUMNS);
  if (view === 'queue') q = q.eq('review_state', 'pending').neq('status', 'suspended');
  else if (view === 'listed') q = q.in('tier', ['listed', 'verified']).neq('status', 'suspended');
  else if (view === 'rejected') q = q.eq('review_state', 'rejected');
  else if (view === 'suspended') q = q.eq('status', 'suspended');
  const { data, error } = await q
    .order('submitted_at', { ascending: view !== 'queue', nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

const MESSAGES: Record<string, (name: string, note: string | null) => string> = {
  approve: (name) => `${name} is approved and now in the DeHub app store.`,
  verify: (name) => `${name} is approved and verified in the DeHub app store.`,
  reject: (name, note) => `${name} was not approved for the store yet${note ? `: ${note}` : '.'} Fix it and submit again.`,
  unlist: (name, note) => `${name} was taken out of the store listing${note ? `: ${note}` : '.'}`,
  suspend: (name, note) => `${name} was suspended${note ? `: ${note}` : '.'} Contact DeHub support.`,
  restore: (name) => `${name} is live again.`,
};

async function decide(db: Db, who: Reviewer, action: string, slug: string, note: string | null) {
  const { data: app } = await db.from('miniapp_apps').select(COLUMNS).eq('slug', slug).maybeSingle();
  if (!app) return { status: 404, body: { error: 'No such app.' } };

  const now = new Date().toISOString();
  const reviewed = { reviewed_at: now, reviewed_by: who.name, updated_at: now };
  let patch: Record<string, unknown>;
  switch (action) {
    case 'approve': patch = { ...reviewed, tier: 'listed', review_state: 'approved', review_note: note, status: 'live' }; break;
    case 'verify': patch = { ...reviewed, tier: 'verified', review_state: 'approved', review_note: note, status: 'live' }; break;
    case 'reject':
      if (!note) return { status: 400, body: { error: 'A reason is required so the developer knows what to fix.' } };
      patch = { ...reviewed, tier: 'unlisted', review_state: 'rejected', review_note: note };
      break;
    case 'unlist': patch = { ...reviewed, tier: 'unlisted', review_note: note }; break;
    case 'suspend': patch = { ...reviewed, status: 'suspended', review_note: note }; break;
    case 'restore': patch = { ...reviewed, status: 'live' }; break;
    default: return { status: 400, body: { error: 'Unknown action.' } };
  }

  const { data: updated, error } = await db.from('miniapp_apps').update(patch).eq('id', app.id).select(COLUMNS).single();
  if (error) throw error;

  const recipients = [...new Set([app.owner_wallet, app.submitted_by].filter((w: string | null) => w && w !== ZERO))];
  if (recipients.length) {
    const { error: notifyError } = await db.from('custom_notifications').insert(
      recipients.map((wallet) => ({
        recipient_address: wallet,
        actor_address: ZERO,
        actor_username: 'DeHub Apps',
        actor_avatar: app.icon_url,
        type: 'miniapp',
        content: MESSAGES[action](app.name, note),
        reference_id: app.slug,
        reference_title: action === 'reject' || action === 'unlist' ? 'https://dehub.io/apps/dev' : null,
      })),
    );
    if (notifyError) console.error('miniapp-admin notify failed', notifyError.message);
  }
  return { status: 200, body: { ok: true, app: updated } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: adsCorsHeaders });
  const who = await reviewer(req.headers.get('Authorization'));
  if (!who) return jsonResponse({ error: 'unauthorized' }, 401);
  const db = serviceClient();
  try {
    if (req.method === 'GET') {
      const view = new URL(req.url).searchParams.get('view') ?? 'queue';
      if (!['queue', 'listed', 'rejected', 'suspended', 'all'].includes(view)) return jsonResponse({ error: 'Unknown view.' }, 400);
      return jsonResponse({ apps: await list(db, view) });
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const slug = typeof body.slug === 'string' ? body.slug : '';
      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
      if (!slug) return jsonResponse({ error: 'slug is required.' }, 400);
      const out = await decide(db, who, String(body.action ?? ''), slug, note);
      return jsonResponse(out.body, out.status);
    }
    return jsonResponse({ error: 'GET or POST only' }, 405);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
