import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ExternalLink, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isWorkAdmin } from '@/constants/app.constants';
import { useAdminDisputes, useAdminResolveDispute } from '@/features/work/hooks/use-work';
import { isWorkContractDeployed } from '@/lib/contracts/dehub-work';
import type { WorkCurrency, WorkJob } from '@/features/work/types';
import { bountyPath } from '@/features/work/seo';
import { WorkUser } from '@/features/work/components/WorkUser';

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
  const [draft, setDraft] = useState<Record<string, { worker: number; poster: number; notes: string; workerAddr: string; pay: boolean }>>({});

  // With no escrow contract deployed there is nothing held to split, so a
  // resolution is a written decision plus â€” if the arbiter chooses â€” a transfer
  // out of their own wallet. Saying so here stops the split fields reading as
  // if they move money on their own.
  const escrowed = isWorkContractDeployed();

  if (!isWorkAdmin(walletAddress)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <ShieldAlert className="w-10 h-10 text-white/40 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white mb-1">Admins only</h1>
        <p className="text-sm text-white/60">
          This wallet isn't on the arbiter list. Add it to <code className="text-white/80">WORK_ADMIN_ARBITERS</code> in{' '}
          <code className="text-white/80">src/constants/app.constants.ts</code> to arbitrate disputes.
        </p>
      </div>
    );
  }

  return (
    <div data-work-surface className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-1">Work â€” Open Disputes</h1>
      <p className="text-sm text-white/60 mb-6">
        {escrowed
          ? 'Split the escrowed funds between worker and poster. The on-chain call and the database state update happen together.'
          : 'Record how each dispute was settled. No bounty is escrowed on-chain, so the split below is the written decision â€” tick â€œpay the worker nowâ€ to send their share from your own wallet as part of resolving.'}
      </p>

      {isLoading ? (
        <div className="text-white/60 text-sm">Loadingâ€¦</div>
      ) : disputes.length === 0 ? (
        <div className="text-white/60 text-sm">No open disputes ðŸŽ‰</div>
      ) : (disputes as DisputeRow[]).map(d => {
        const j = d.job;
        const k = d.id;
        const v = draft[k] || { worker: 0, poster: 0, notes: '', workerAddr: j?.awarded_worker_address ?? '', pay: false };
        const remaining = j ? (Number(j.total_budget) - Number(j.released_amount || 0)) : 0;
        const total = (v.worker || 0) + (v.poster || 0);
        const valid = j && total <= remaining + 1e-9 && v.workerAddr?.length === 42;
        const set = (patch: Partial<typeof v>) => setDraft({ ...draft, [k]: { ...v, ...patch } });

        return (
          <div key={k} className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <Link to={j ? bountyPath(j) : `/work/${d.job_id}`} className="text-lg font-semibold text-white hover:underline inline-flex items-center gap-1">
                  {j?.title || 'Untitled'} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </Link>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-[11px] text-white/40">opened by</span>
                  <WorkUser address={d.opened_by_address} />
                  <span className="text-[11px] text-white/40">Â· {new Date(d.created_at).toLocaleString()}</span>
                </div>
              </div>
              {j && (
                <div className="text-right text-xs text-white/60 shrink-0">
                  <div>{remaining.toLocaleString(undefined, { maximumFractionDigits: 4 })} {j.currency} unreleased</div>
                  <div className="text-[11px] text-white/40">{escrowed ? `on-chain id: ${j.onchain_job_id ?? 'â€”'}` : 'not escrowed'}</div>
                </div>
              )}
            </div>

            <p className="text-sm text-white/80 whitespace-pre-wrap mb-2">{d.reason}</p>
            {d.evidence_url && (
              <a href={d.evidence_url} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1 mb-3">
                <ExternalLink className="w-3 h-3" /> {d.evidence_url}
              </a>
            )}

            {/* Who is actually being paid, resolved to a person rather than left
                as 42 hex characters the arbiter has to eyeball. */}
            {v.workerAddr?.length === 42 && (
              <div className="flex items-center gap-2 mt-3 mb-1">
                <span className="text-[11px] uppercase tracking-wide text-white/40">Paying</span>
                <WorkUser address={v.workerAddr.toLowerCase()} showAddress />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field label="Worker address">
                <input value={v.workerAddr} onChange={(e) => set({ workerAddr: e.target.value })} placeholder="0xâ€¦" className={inputCls} />
              </Field>
              <Field label={`Worker amount (${j?.currency || ''})`}>
                <input type="number" min={0} step="0.0001" value={v.worker} onChange={(e) => set({ worker: Number(e.target.value) })} className={inputCls} />
              </Field>
              <Field label={`Poster refund (${j?.currency || ''})`}>
                <input type="number" min={0} step="0.0001" value={v.poster} onChange={(e) => set({ poster: Number(e.target.value) })} className={inputCls} />
              </Field>
              <Field label="Notes (optional)">
                <input value={v.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
              </Field>
            </div>

            {!escrowed && v.worker > 0 && (
              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={v.pay}
                  onChange={(e) => set({ pay: e.target.checked })}
                  className="mt-0.5 accent-emerald-400"
                />
                <span className="text-xs text-white/70">
                  Send {v.worker.toLocaleString(undefined, { maximumFractionDigits: 4 })} {j?.currency} to the worker
                  <span className="text-white/40"> â€” from your wallet, now, as part of resolving.</span>
                </span>
              </label>
            )}

            <div className="flex items-center justify-between gap-3 mt-4">
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
                  pay_worker: v.pay,
                })}
                className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {v.pay && !escrowed && <Wallet className="w-3.5 h-3.5" />}
                {v.pay && !escrowed ? 'Resolve & pay' : 'Resolve'}
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
