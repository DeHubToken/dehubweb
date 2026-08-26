import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Wallet, AlertTriangle, Plus } from 'lucide-react';
import { useMyPostedJobs, useMyWorkSubmissions } from '@/features/work/hooks/use-work';
import { bountyPath } from '@/features/work/seo';
import { TxLink, statusBadgeClass, statusLabel } from '@/features/work/components/TxLink';
import type { WorkJob, WorkJobStatus, WorkSubmission } from '@/features/work/types';
import { useAuth } from '@/contexts/AuthContext';
import { isWorkContractDeployed } from '@/lib/contracts/dehub-work';
import { SEOHead } from '@/components/SEOHead';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

type Tab = 'posted' | 'worked';

/**
 * A bounty you posted can be in any state. A bounty you *worked* only ever
 * reaches you through a submission, and you cannot submit against a draft — so
 * offering `draft` on that tab is a filter that can never match.
 */
const STATUS_OPTIONS: Record<Tab, Array<WorkJobStatus | 'all'>> = {
  posted: ['all', 'draft', 'open', 'in_progress', 'completed', 'disputed', 'cancelled', 'expired'],
  worked: ['all', 'open', 'in_progress', 'completed', 'disputed', 'cancelled', 'expired'],
};

export default function WorkHistoryPage() {
  const navigate = useNavigate();
  const { walletAddress, openLoginModal } = useAuth();
  const [tab, setTab] = useState<Tab>('posted');
  const [status, setStatus] = useState<WorkJobStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Only the visible tab's query runs — opening the page shouldn't cost two
  // round-trips when one of them is behind a tab the user may never press.
  const postedQuery = useMyPostedJobs(tab === 'posted');
  const workedQuery = useMyWorkSubmissions(tab === 'worked');
  const { data: posted = [] } = postedQuery;
  const { data: submissions = [] } = workedQuery;
  const { isLoading, isError, refetch } = tab === 'posted' ? postedQuery : workedQuery;

  const q = search.trim().toLowerCase();
  const filteredPosted = useMemo(() => posted.filter((j) =>
    (status === 'all' || j.status === status) && (!q || j.title.toLowerCase().includes(q))
  ), [posted, status, q]);
  const filteredSubmissions = useMemo(() => submissions.filter((s) =>
    (status === 'all' || s.job?.status === status) && (!q || s.job?.title.toLowerCase().includes(q))
  ), [submissions, status, q]);

  // The status lists differ per tab, so a filter that is valid on one can be
  // dead on the other. Reset it rather than silently showing an empty list.
  const switchTab = (next: Tab) => {
    setTab(next);
    if (!STATUS_OPTIONS[next].includes(status)) setStatus('all');
  };

  const hasFilters = status !== 'all' || !!q;
  const isEmpty = tab === 'posted' ? filteredPosted.length === 0 : filteredSubmissions.length === 0;

  return (
    <div data-work-surface className="max-w-3xl mx-auto px-4 py-6">
      {/* Authed, per-wallet page: never indexable, but it still needs its own
          head or it inherits the title and canonical of whatever route came
          before it — see src/lib/head-meta.ts. */}
      <SEOHead
        title="My Bounties | DeHub"
        description="Every bounty you've posted or worked on DeHub, with their on-chain escrow and payout transactions."
        url="https://dehub.io/work/history"
        noindex
      />

      <button onClick={() => navigate('/work')} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3 mb-4">
        <ThemedIcon icon="bounties" alt="" className="w-10 h-10 shrink-0 object-contain" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white">My Bounties</h1>
          <p className="text-sm text-white/60">Every bounty you've posted or worked on, including completed ones.</p>
        </div>
      </div>

      {!walletAddress ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <Wallet className="w-8 h-8 text-white/40 mx-auto mb-2" />
          <h2 className="text-base font-semibold text-white mb-1">Connect your wallet</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto mb-4">Connect to see the bounties you've posted or worked on.</p>
          <button onClick={() => openLoginModal()} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold">Connect wallet</button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div role="tablist" aria-label="Bounty history" className="flex items-center gap-2 mb-3">
            {(['posted', 'worked'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => switchTab(t)}
                className={`px-4 py-2 rounded-xl text-sm transition-colors ${
                  tab === t
                    ? 'bg-white/15 text-white border border-white/20'
                    : 'bg-white/5 text-white/60 border border-transparent hover:bg-white/10'
                }`}
              >
                {t === 'posted' ? 'Posted by me' : 'Worked on'}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search your bounties by title"
                placeholder="Search by title…"
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkJobStatus | 'all')}
              aria-label="Filter by status"
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
            >
              {STATUS_OPTIONS[tab].map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All statuses' : statusLabel(s)}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            /* Without this branch a failed query falls through to the empty
               state and tells a poster with 40 bounties they have none. */
            <div className="text-center py-16">
              <AlertTriangle className="w-8 h-8 text-white/40 mx-auto mb-3" />
              <p className="text-sm text-white/60 mb-4">Couldn't load your bounties.</p>
              <button onClick={() => refetch()} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/15 transition-colors">
                Try again
              </button>
            </div>
          ) : isEmpty ? (
            <EmptyState tab={tab} hasFilters={hasFilters} onClear={() => { setStatus('all'); setSearch(''); }} />
          ) : tab === 'posted' ? (
            <div className="space-y-3">
              {filteredPosted.map((job) => <PostedRow key={job.id} job={job} />)}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map((s) => <SubmissionRow key={s.id} submission={s} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ tab, hasFilters, onClear }: { tab: Tab; hasFilters: boolean; onClear: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="text-center py-16">
      <ThemedIcon icon="bounties" alt="" className="w-12 h-12 object-contain mx-auto mb-3 opacity-60" />
      <p className="text-white/60 mb-4">
        {hasFilters
          ? 'No bounties match these filters.'
          : tab === 'posted'
            ? "You haven't posted a bounty yet."
            : "You haven't submitted work on a bounty yet."}
      </p>
      <div className="flex items-center justify-center gap-3">
        {hasFilters ? (
          <button onClick={onClear} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm hover:bg-white/15 transition-colors">
            Clear filters
          </button>
        ) : tab === 'posted' ? (
          <button onClick={() => navigate('/work/post')} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Post a Bounty
          </button>
        ) : (
          <button onClick={() => navigate('/work')} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold">
            Browse bounties
          </button>
        )}
      </div>
    </div>
  );
}

function PostedRow({ job }: { job: WorkJob }) {
  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <Link to={bountyPath(job)} className="text-sm font-semibold text-white hover:underline line-clamp-1">{job.title}</Link>
        <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${statusBadgeClass(job.status)}`}>{statusLabel(job.status)}</span>
      </div>
      <div className="text-xs text-white/50">
        {job.total_budget.toLocaleString('en-US', { maximumFractionDigits: 4 })} {job.currency} · {new Date(job.created_at).toLocaleDateString()}
      </div>
      {/* Until the escrow contract is deployed nothing ever writes a hash, so
          the "no tx" note would be the most-repeated line on the page. */}
      {job.fund_tx_hash ? (
        <div className="mt-2"><TxLink label="Escrow tx" txHash={job.fund_tx_hash} /></div>
      ) : isWorkContractDeployed() ? (
        <div className="mt-2 text-[11px] text-white/30">Not escrowed on-chain</div>
      ) : null}
    </div>
  );
}

function SubmissionRow({ submission: s }: { submission: WorkSubmission & { job: WorkJob | null } }) {
  const job = s.job;
  // Approved is not paid. Treating the two as one status is what let ~500k DHB
  // of accepted work show a green "paid" tick on this very page while no
  // transfer had happened — a payout is real only once it has a tx hash.
  const paid = !!s.payout_tx_hash || s.approval_status === 'paid';
  const awaitingPayment = s.approval_status === 'approved' && !s.payout_tx_hash;
  const due = Number(s.payout_amount) || 0;

  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        {job ? (
          <Link to={bountyPath(job)} className="text-sm font-semibold text-white hover:underline line-clamp-1">{job.title}</Link>
        ) : (
          <span className="text-sm font-semibold text-white/60">Untitled bounty</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {job && <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${statusBadgeClass(job.status)}`}>{statusLabel(job.status)}</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${
            paid ? 'bg-emerald-500/20 text-emerald-300' :
            awaitingPayment ? 'bg-amber-400/20 text-amber-200' :
            s.approval_status === 'rejected' ? 'bg-red-500/20 text-red-300' :
            'bg-white/10 text-white/60'
          }`}>
            {paid ? 'paid' : awaitingPayment ? 'awaiting payment' : s.approval_status}
          </span>
        </div>
      </div>
      <div className="text-xs text-white/50">
        {new Date(s.created_at).toLocaleDateString()}
        {(paid || awaitingPayment) && due > 0 && job && ` · ${due.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${job.currency}`}
      </div>
      {s.payout_tx_hash ? (
        <div className="mt-2"><TxLink label="Payout tx" txHash={s.payout_tx_hash} /></div>
      ) : awaitingPayment ? (
        <div className="mt-2 text-[11px] text-amber-200/70">
          Accepted — payment not sent yet.
        </div>
      ) : null}
    </div>
  );
}
