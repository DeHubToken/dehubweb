/**
 * admin-user-creations
 * ====================
 * Everything a wallet has paid for or made, in one place, so support can hand a
 * creator their video by hand when something went wrong on their side.
 *
 * GET ?wallet=0x…
 *   → payments     every DHB transfer that paid for generation, with what is left
 *                  unspent (paid but never delivered shows up here)
 *   → jobs         every paid Creator render: model, price, status, refund flag
 *   → generations  archived Creator outputs, each with a 24h download link
 *   → exports      editor exports kept in cloud storage, with download links
 *   → projects     the wallet's editor cloud projects
 *   → exportLog    the newest editor export attempts, including failures and why
 *
 * All of this sits behind the service role (the tables refuse anon and the
 * buckets are private), so it lives here behind real admin auth, the same
 * bridge `work-admin` and `admin-stages` use: the caller's admin JWT from
 * api.dehub.io is checked against `GET /api/admin/me`, never trusted.
 * VIEWER is excluded because the links open private user media.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';

const DEHUB_API_BASE = 'https://api.dehub.io';
const SUPPORT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);
const LINK_TTL = 60 * 60 * 24;
const LOG_LIMIT = 60;

async function isSupportAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/admin/me`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const admin = json?.admin ?? json?.data?.admin ?? json;
    if (admin?.isActive === false) return false;
    return SUPPORT_ROLES.has(String(admin?.role ?? '').toUpperCase());
  } catch {
    return false;
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

async function signAll(db: Db, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!paths.length) return links;
  const { data } = await db.storage.from(bucket).createSignedUrls(paths, LINK_TTL);
  for (const row of data ?? []) if (row.path && row.signedUrl) links.set(row.path, row.signedUrl);
  return links;
}

async function exportLog(db: Db, wallet: string) {
  const folder = `${wallet}/export-logs`;
  const { data: files } = await db.storage.from('creator-assets').list(folder, {
    limit: LOG_LIMIT, sortBy: { column: 'name', order: 'desc' },
  });
  const entries = await Promise.all((files ?? []).map(async (file: { name: string }) => {
    const { data } = await db.storage.from('creator-assets').download(`${folder}/${file.name}`);
    try { return data ? JSON.parse(await data.text()) : null; } catch { return null; }
  }));
  return entries.filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: adsCorsHeaders });
  if (req.method !== 'GET') return jsonResponse({ error: 'GET only' }, 405);
  if (!(await isSupportAdmin(req.headers.get('Authorization')))) return jsonResponse({ error: 'unauthorized' }, 401);

  const wallet = new URL(req.url).searchParams.get('wallet')?.toLowerCase() ?? '';
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return jsonResponse({ error: 'wallet must be a 0x address' }, 400);

  const db = serviceClient();
  try {
    const [payments, jobs, generations, exports, projects, log] = await Promise.all([
      db.from('ai_payments').select('tx_hash,chain,paid_dhb,remaining_dhb,purpose,created_at')
        .eq('wallet_address', wallet).order('created_at', { ascending: false }).limit(200),
      db.from('ai_generation_jobs').select('id,tx_hash,price_dhb,kind,model,endpoint,status,result,metadata,created_at,updated_at')
        .eq('wallet_address', wallet).order('created_at', { ascending: false }).limit(200),
      db.from('creator_assets').select('id,storage_path,metadata,ready,created_at')
        .eq('wallet_address', wallet).order('created_at', { ascending: false }).limit(200),
      db.from('editor_assets').select('id,name,mime_type,size_bytes,storage_path,duration_seconds,posted_post_id,created_at')
        .eq('wallet_address', wallet).eq('kind', 'export').order('created_at', { ascending: false }).limit(100),
      db.from('editor_cloud_projects').select('id,title,revision,created_at,updated_at')
        .eq('wallet_address', wallet).order('updated_at', { ascending: false }).limit(100),
      exportLog(db, wallet),
    ]);
    for (const res of [payments, jobs, generations, exports, projects]) if (res.error) throw res.error;

    const generationLinks = await signAll(db, 'creator-assets',
      (generations.data ?? []).map((g: { storage_path: string | null }) => g.storage_path).filter((p): p is string => !!p));
    const exportLinks = await signAll(db, 'editor-assets',
      (exports.data ?? []).map((e: { storage_path: string }) => e.storage_path));

    // Jobs per payment, so a transfer that paid twice (or paid and delivered
    // nothing) stands out without reading every row.
    const jobsByTx = new Map<string, number>();
    for (const job of jobs.data ?? []) jobsByTx.set(job.tx_hash, (jobsByTx.get(job.tx_hash) ?? 0) + 1);

    return jsonResponse({
      wallet,
      payments: (payments.data ?? []).map((p: Record<string, unknown>) => ({ ...p, jobs: jobsByTx.get(String(p.tx_hash)) ?? 0 })),
      jobs: (jobs.data ?? []).map((j: Record<string, any>) => ({
        id: j.id, txHash: j.tx_hash, priceDhb: j.price_dhb, kind: j.kind, model: j.model, status: j.status,
        prompt: j.metadata?.prompt ?? null, refunded: !!j.result?.paymentRestored, savePending: !!j.result?.savePending,
        archived: (generations.data ?? []).some((g: { id: string; ready: boolean }) => g.id === j.id && g.ready),
        createdAt: j.created_at, updatedAt: j.updated_at,
      })),
      generations: (generations.data ?? []).map((g: Record<string, any>) => ({
        id: g.id, ready: g.ready, kind: g.metadata?.kind ?? null, model: g.metadata?.modelName ?? g.metadata?.model ?? null,
        prompt: g.metadata?.prompt ?? null, createdAt: g.created_at,
        url: g.storage_path ? generationLinks.get(g.storage_path) ?? null : g.metadata?.url ?? null,
      })),
      exports: (exports.data ?? []).map((e: Record<string, any>) => ({
        id: e.id, name: e.name, mimeType: e.mime_type, bytes: e.size_bytes, durationSeconds: e.duration_seconds,
        postedPostId: e.posted_post_id, createdAt: e.created_at, url: exportLinks.get(e.storage_path) ?? null,
      })),
      projects: projects.data ?? [],
      exportLog: log,
      linksExpireIn: LINK_TTL,
    });
  } catch (error) {
    console.error('[admin-user-creations]', String((error as Error)?.message ?? error));
    return jsonResponse({ error: 'Could not load this wallet’s creations' }, 500);
  }
});
