/**
 * work-admin
 * ==========
 * Bounty dispute arbitration for godmode's Bounty Disputes page.
 *
 * The bounty tables live in Supabase while the admin panel authenticates
 * against the Mongo-backed DeHub API, and `work_disputes`' RLS keys every write
 * to `get_request_wallet_address()` — a wallet an admin does not have. Wallet
 * headers are client-controlled anyway, so RLS cannot express "is a moderator".
 * So arbitration lives here, behind real admin auth, with the service role doing
 * the write. Same shape as `ads-admin`, for the same reason.
 *
 * GET  ?action=queue
 *   → open disputes, each with its job and that job's submissions
 * POST {action:'resolve', dispute_id, job_id, worker_address, worker_amount,
 *       poster_refund, note?, resolution_tx_hash?}
 *   → settle the dispute and close the job
 * POST {action:'record_payout', submission_id, job_id, tx_hash, amount?}
 *   → attach a real transaction to a submission that was paid off-platform
 *
 * Why `record_payout` exists: approval never moved money until 2026-08-26, so
 * there is a backlog of submissions marked `approved` with a null
 * `payout_tx_hash`. Some of those may get settled by hand. Without a way to
 * record that, the row stays "awaiting payment" forever and the next person to
 * look at it pays twice.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adsCorsHeaders, jsonResponse } from '../_shared/povr.ts';

const DEHUB_API_BASE = 'https://api.dehub.io';

/** Roles allowed to arbitrate. VIEWER is deliberately excluded — it is the
 *  role handed to people outside the team, and it already sees no reports. */
const ARBITER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

/**
 * Resolve the caller's admin role server-side.
 *
 * `GET /api/admin/me` is guarded by `AdminJwtAuthGuard` alone, so every signed-in
 * seat can call it — which makes it the right probe: it answers *who* rather
 * than merely whether some endpoint was reachable. `ads-admin` probes
 * `GET /api/admin` instead because approving an ad demands ADMIN; a dispute is
 * moderation, so the role is read and compared rather than inferred from a
 * status code.
 */
interface Arbiter {
  role: string;
  /** Identity written to `work_disputes.resolved_by_admin` — an arbitration
   *  decision that cannot say who made it is not an audit trail. */
  label: string;
}

async function resolveArbiter(authHeader: string | null): Promise<Arbiter | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/admin/me`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const admin = json?.admin ?? json?.data?.admin ?? json;
    if (admin?.isActive === false) return null;
    const role = String(admin?.role ?? '').toUpperCase();
    if (!ARBITER_ROLES.has(role)) return null;
    return { role, label: String(admin?.email ?? admin?.displayName ?? admin?.id ?? 'unknown') };
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

const isAddress = (v: unknown): v is string => typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
const isTxHash = (v: unknown): v is string => typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v);

/**
 * Recompute a job's rollups from its submissions.
 *
 * Nothing in the database maintains `units_approved` or `released_amount`, and
 * both web and mobile now recompute them the same way after a payout. Doing the
 * same here keeps a panel-recorded payout from leaving the figure behind.
 */
// deno-lint-ignore no-explicit-any
async function syncJobTotals(supabase: any, jobId: string) {
  const { data } = await supabase
    .from('work_submissions')
    .select('approval_status, payout_amount, payout_tx_hash')
    .eq('job_id', jobId);
  const rows = data ?? [];
  await supabase
    .from('work_jobs')
    .update({
      units_approved: rows.filter((r: any) => r.approval_status === 'approved' || r.approval_status === 'paid').length,
      released_amount: rows
        .filter((r: any) => !!r.payout_tx_hash)
        .reduce((sum: number, r: any) => sum + Number(r.payout_amount || 0), 0),
    })
    .eq('id', jobId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: adsCorsHeaders });

  const arbiter = await resolveArbiter(req.headers.get('Authorization'));
  if (!arbiter) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabase = serviceClient();

  try {
    if (req.method === 'GET') {
      const action = new URL(req.url).searchParams.get('action') ?? 'queue';
      if (action !== 'queue') return jsonResponse({ error: 'unknown action' }, 400);

      const { data: disputes, error } = await supabase
        .from('work_disputes')
        .select('*, job:work_jobs(*)')
        .eq('status', 'open')
        .order('created_at', { ascending: true });
      if (error) throw error;

      // The submissions carry the proof links and who is owed what, which is
      // the whole evidence base for the decision — without them the arbiter is
      // reading a complaint with no other side.
      const jobIds = [...new Set((disputes ?? []).map((d: any) => d.job_id))];
      const { data: submissions } = jobIds.length
        ? await supabase.from('work_submissions').select('*').in('job_id', jobIds)
        : { data: [] };

      return jsonResponse({
        disputes: (disputes ?? []).map((d: any) => ({
          ...d,
          submissions: (submissions ?? []).filter((s: any) => s.job_id === d.job_id),
        })),
      });
    }

    if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

    const body = await req.json().catch(() => ({}));

    if (body.action === 'record_payout') {
      if (typeof body.submission_id !== 'string' || typeof body.job_id !== 'string') {
        return jsonResponse({ error: 'submission_id and job_id are required' }, 400);
      }
      if (!isTxHash(body.tx_hash)) {
        return jsonResponse({ error: 'tx_hash must be a 0x-prefixed 32-byte transaction hash' }, 400);
      }

      const patch: Record<string, unknown> = {
        approval_status: 'paid',
        payout_tx_hash: body.tx_hash.toLowerCase(),
      };
      if (Number(body.amount) > 0) patch.payout_amount = Number(body.amount);

      const { error } = await supabase.from('work_submissions').update(patch).eq('id', body.submission_id);
      if (error) throw error;
      await syncJobTotals(supabase, body.job_id);
      return jsonResponse({ ok: true });
    }

    if (body.action === 'resolve') {
      if (typeof body.dispute_id !== 'string' || typeof body.job_id !== 'string') {
        return jsonResponse({ error: 'dispute_id and job_id are required' }, 400);
      }
      const workerAmount = Number(body.worker_amount ?? 0);
      const posterRefund = Number(body.poster_refund ?? 0);
      if (!Number.isFinite(workerAmount) || !Number.isFinite(posterRefund) || workerAmount < 0 || posterRefund < 0) {
        return jsonResponse({ error: 'amounts must be non-negative numbers' }, 400);
      }
      if (workerAmount > 0 && !isAddress(body.worker_address)) {
        return jsonResponse({ error: 'worker_address is required when awarding the worker' }, 400);
      }
      if (body.resolution_tx_hash != null && !isTxHash(body.resolution_tx_hash)) {
        return jsonResponse({ error: 'resolution_tx_hash must be a 0x-prefixed 32-byte transaction hash' }, 400);
      }

      // Same derivation web uses, so a dispute resolved here and one resolved
      // from /work/disputes land on the same status.
      const status =
        workerAmount > 0 && posterRefund > 0 ? 'resolved_split'
        : workerAmount > 0 ? 'resolved_worker'
        : 'resolved_poster';

      const { error: e1 } = await supabase
        .from('work_disputes')
        .update({
          status,
          resolved_at: new Date().toISOString(),
          // Who arbitrated. `resolved_by_address` is the wallet path used by
          // dehubweb's own /work/disputes; an admin arbitrating from godmode has
          // no wallet, so their seat is recorded here instead and the wallet
          // column stays null rather than being filled with something that is
          // not an address.
          resolved_by_admin: arbiter.label,
          resolution_note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
          resolution_tx_hash: body.resolution_tx_hash ? String(body.resolution_tx_hash).toLowerCase() : null,
          worker_amount: workerAmount,
          poster_refund: posterRefund,
        })
        .eq('id', body.dispute_id)
        .eq('status', 'open'); // never re-resolve a settled dispute
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('work_jobs')
        .update({ status: 'completed' })
        .eq('id', body.job_id);
      if (e2) throw e2;

      await syncJobTotals(supabase, body.job_id);
      return jsonResponse({ ok: true, status });
    }

    return jsonResponse({ error: 'unknown action' }, 400);
  } catch (err) {
    console.error('[work-admin]', err);
    return jsonResponse({ error: (err as Error)?.message ?? 'failed' }, 500);
  }
});
