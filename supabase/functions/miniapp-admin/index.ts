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
 * GET  ?view=rewards
 *   → weeks: every unpaid reward plus the last 8 weeks, with app and owner wallet
 * POST { action: 'markPaid', weekStart, appId, txHash }   (ADMIN / SUPER_ADMIN)
 *   The admin hub's "Pay rewards" button sends each DHB transfer from the
 *   admin's own wallet on BNB Chain, then calls this. The transfer is checked
 *   on chain (succeeded, DHB, to the owner wallet, at least the amount) before
 *   the reward is marked paid, and the developer is notified. No key is kept
 *   on the server.
 *
 * Every decision lands in the developer's notifications (type 'miniapp', so a
 * tap opens /apps/<slug>). Callers are checked against api.dehub.io
 * `GET /api/admin/me`, the same bridge the other admin functions use.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';

const DEHUB_API_BASE = 'https://api.dehub.io';
const REVIEW_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);
const PAY_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);
const ZERO = '0x0000000000000000000000000000000000000000';
const DHB_BNB = '0x680d3113caf77b61b510f332d5ef4cf5b41a761d';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BNB_RPCS = ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed1.binance.org'];

const COLUMNS =
  'id, slug, domain, home_url, name, subtitle, description, icon_url, splash_image_url, category, tags, permissions, ' +
  'tier, status, source, owner_wallet, submitted_by, review_state, review_note, submitted_at, reviewed_at, reviewed_by, created_at, updated_at';

interface Reviewer { name: string; canPay: boolean }

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
    const role = String(admin?.role ?? '').toUpperCase();
    if (!REVIEW_ROLES.has(role)) return null;
    return { name: String(admin?.username ?? admin?.email ?? admin?.name ?? 'admin').slice(0, 80), canPay: PAY_ROLES.has(role) };
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

async function rewards(db: Db) {
  const cols = 'week_start, app_id, owner_wallet, share, amount_dhb, paid_tx, paid_at, miniapp_apps(slug, name, icon_url)';
  const [{ data: unpaid, error: e1 }, { data: weeks }] = await Promise.all([
    db.from('miniapp_rewards').select(cols).is('paid_at', null).order('week_start', { ascending: false }).limit(200),
    db.from('miniapp_rewards').select('week_start').order('week_start', { ascending: false }).limit(400),
  ]);
  if (e1) throw e1;
  const recent = [...new Set((weeks ?? []).map((w: { week_start: string }) => w.week_start))].slice(0, 8);
  const { data: paid } = recent.length
    ? await db.from('miniapp_rewards').select(cols).in('week_start', recent).not('paid_at', 'is', null)
    : { data: [] };
  const rows = [...(unpaid ?? []), ...(paid ?? [])];
  const byWeek = new Map<string, unknown[]>();
  for (const r of rows) byWeek.set(r.week_start, [...(byWeek.get(r.week_start) ?? []), r]);
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekStart, list]) => ({ weekStart, rewards: list }));
}

/** DHB amount (decimal string, 18 decimals) as base units. */
function toUnits(amount: string | number): bigint {
  const [whole, frac = ''] = String(amount).split('.');
  return BigInt(whole || '0') * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18));
}

async function rpcReceipt(txHash: string) {
  for (const url of BNB_RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json();
      if (json?.result !== undefined) return json.result;
    } catch { /* try the next node */ }
  }
  throw new Error('Could not reach BNB Chain. Try again in a minute.');
}

async function markPaid(db: Db, who: Reviewer, weekStart: string, appId: string, txHash: string) {
  if (!who.canPay) return { status: 403, body: { error: 'Only admins can pay rewards.' } };
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { status: 400, body: { error: 'That is not a transaction hash.' } };
  const { data: row } = await db
    .from('miniapp_rewards')
    .select('week_start, app_id, owner_wallet, amount_dhb, paid_at, miniapp_apps(slug, name, icon_url)')
    .eq('week_start', weekStart).eq('app_id', appId).maybeSingle();
  if (!row) return { status: 404, body: { error: 'No such reward.' } };
  if (row.paid_at) return { status: 409, body: { error: 'Already paid.' } };
  const { data: reused } = await db.from('miniapp_rewards').select('app_id').eq('paid_tx', txHash.toLowerCase()).limit(1);
  if (reused?.length) return { status: 409, body: { error: 'That transaction already paid another reward.' } };

  const receipt = await rpcReceipt(txHash);
  if (!receipt) return { status: 202, body: { error: 'Not confirmed yet.', pending: true } };
  if (receipt.status !== '0x1') return { status: 400, body: { error: 'That transaction failed on chain.' } };
  const to = String(row.owner_wallet).toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const sent = (receipt.logs ?? [])
    .filter((l: { address: string; topics: string[] }) =>
      l.address?.toLowerCase() === DHB_BNB && l.topics?.[0] === TRANSFER_TOPIC && l.topics?.[2]?.toLowerCase() === `0x${to}`)
    .reduce((sum: bigint, l: { data: string }) => sum + BigInt(l.data), 0n);
  if (sent < toUnits(row.amount_dhb)) {
    return { status: 400, body: { error: 'That transaction does not send this reward\'s DHB to the owner wallet.' } };
  }

  const now = new Date().toISOString();
  const { error } = await db.from('miniapp_rewards')
    .update({ paid_tx: txHash.toLowerCase(), paid_at: now })
    .eq('week_start', weekStart).eq('app_id', appId).is('paid_at', null);
  if (error) throw error;

  const amount = Number(row.amount_dhb).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const { error: notifyError } = await db.from('custom_notifications').insert({
    recipient_address: row.owner_wallet,
    actor_address: ZERO,
    actor_username: 'DeHub Apps',
    actor_avatar: row.miniapp_apps?.icon_url ?? null,
    type: 'miniapp',
    content: `${row.miniapp_apps?.name ?? 'Your app'} earned ${amount} DHB in app rewards for the week of ${weekStart}. It is in your wallet.`,
    reference_id: row.miniapp_apps?.slug ?? null,
    reference_title: `https://bscscan.com/tx/${txHash}`,
  });
  if (notifyError) console.error('miniapp-admin reward notify failed', notifyError.message);
  console.log('miniapp reward paid', JSON.stringify({ weekStart, appId, txHash, by: who.name }));
  return { status: 200, body: { ok: true, paidAt: now } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: adsCorsHeaders });
  const who = await reviewer(req.headers.get('Authorization'));
  if (!who) return jsonResponse({ error: 'unauthorized' }, 401);
  const db = serviceClient();
  try {
    if (req.method === 'GET') {
      const view = new URL(req.url).searchParams.get('view') ?? 'queue';
      if (view === 'rewards') return jsonResponse({ weeks: await rewards(db), canPay: who.canPay });
      if (!['queue', 'listed', 'rejected', 'suspended', 'all'].includes(view)) return jsonResponse({ error: 'Unknown view.' }, 400);
      return jsonResponse({ apps: await list(db, view) });
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.action === 'markPaid') {
        const out = await markPaid(db, who, String(body.weekStart ?? ''), String(body.appId ?? ''), String(body.txHash ?? ''));
        return jsonResponse(out.body, out.status);
      }
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
