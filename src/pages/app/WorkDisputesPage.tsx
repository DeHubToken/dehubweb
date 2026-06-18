import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isWorkAdmin } from '@/constants/app.constants';
import { useAdminDisputes, useAdminResolveDispute } from '@/features/work/hooks/use-work';
import type { WorkCurrency, WorkJob } from '@/features/work/types';

type DisputeRow = {
  id: string;
  job_id: string;
  opened_by_address: string;
  reason: string;
  evidence_url: string | null;
  created_at: string;
  job: WorkJob | null;
};

export default function WorkDisputesPage() {
  const { walletAddress } = useAuth();
  const { data: disputes = [], isLoading } = useAdminDisputes();
  const resolve = useAdminResolveDispute();
  const [draft, setDraft] = useState<Record<string, { worker: number; poster: number; notes: string; workerAddr: string }>>({});

  if (!isWorkAdmin(walletAddress)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <ShieldAlert className="w-10 h-10 text-white/40 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white mb-1">Admins only</h1>
        <p className="text-sm text-white/60">Your wallet isn't whitelisted to arbitrate disputes.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-1">Work — Open Disputes</h1>
      <p className="text-sm text-white/60 mb-6">Resolve escrowed funds split between worker and poster. The on-chain call (if contract is deployed) plus the database state update happen together.</p>

      {isLoading ? (
        <div className="text-white/60 text-sm">Loading…</div>
      ) : disputes.length === 0 ? (
        <div className="text-white/60 text-sm">No open disputes 🎉</div>
      ) : (disputes as DisputeRow[]).map(d => {
        const j = d.job;
        const k = d.id;
        const v = draft[k] || { worker: 0, poster: 0, notes: '', workerAddr: j?.awarded_worker_address ?? '' };
        const remaining = j ? (Number(j.total_budget) - Number(j.released_amount || 0)) : 0;
        const total = (v.worker || 0) + (v.poster || 0);
        const valid = j && total <= remaining + 1e-9 && v.workerAddr?.length === 42;

        return (
          <div key={k} className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <Link to={`/work/${d.job_id}`} className="text-lg font-semibold text-white hover:underline inline-flex items-center gap-1">
                  {j?.title || 'Untitled'} <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                <div className="text-[11px] text-white/40 mt-0.5">
                  opened by {d.opened_by_address.slice(0, 6)}…{d.opened_by_address.slice(-4)} · {new Date(d.created_at).toLocaleString()}
                </div>
              </div>
              {j && (
                <div className="text-right text-xs text-white/60">
                  <div>{remaining.toLocaleString(undefined, { maximumFractionDigits: 4 })} {j.currency} in escrow</div>
                  <div className="text-[11px] text-white/40">on-chain id: {j.onchain_job_id ?? '—'}</div>
                </div>
              )}
            </div>

            <p className="text-sm text-white/80 whitespace-pre-wrap mb-2">{d.reason}</p>
            {d.evidence_url && (
              <a href={d.evidence_url} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1 mb-3">
                <ExternalLink className="w-3 h-3" /> {d.evidence_url}
              </a>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field label="Worker address">
                <input value={v.workerAddr} onChange={(e) => setDraft({ ...draft, [k]: { ...v, workerAddr: e.target.value } })} placeholder="0x…" className={inputCls} />
              </Field>
              <Field label={`Worker amount (${j?.currency || ''})`}>
                <input type="number" min={0} step="0.0001" value={v.worker} onChange={(e) => setDraft({ ...draft, [k]: { ...v, worker: Number(e.target.value) } })} className={inputCls} />
              </Field>
              <Field label={`Poster refund (${j?.currency || ''})`}>
                <input type="number" min={0} step="0.0001" value={v.poster} onChange={(e) => setDraft({ ...draft, [k]: { ...v, poster: Number(e.target.value) } })} className={inputCls} />
              </Field>
              <Field label="Notes (optional)">
                <input value={v.notes} onChange={(e) => setDraft({ ...draft, [k]: { ...v, notes: e.target.value } })} className={inputCls} />
              </Field>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="text-[11px] text-white/40">
                Total: {total.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {remaining.toLocaleString(undefined, { maximumFractionDigits: 4 })} {j?.currency}
              </div>
              <button
                disabled={!valid || resolve.isPending}
                onClick={() => j && resolve.mutate({
                  dispute_id: d.id,
                  job_id: d.job_id,
                  onchain_job_id: j.onchain_job_id,
                  currency: j.currency as WorkCurrency,
                  worker_address: v.workerAddr,
                  worker_amount: v.worker,
                  poster_refund: v.poster,
                  resolution_notes: v.notes,
                })}
                className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40"
              >
                Resolve
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
