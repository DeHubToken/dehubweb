import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ExternalLink, Wallet } from 'lucide-react';
import { useMyPostedJobs, useMyWorkSubmissions } from '@/features/work/hooks/use-work';
import { bountyPath } from '@/features/work/seo';
import type { WorkJob, WorkJobStatus, WorkSubmission } from '@/features/work/types';
import { useAuth } from '@/contexts/AuthContext';
import { workExplorerTxUrl } from '@/lib/contracts/dehub-work';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

const STATUS_OPTIONS: Array<WorkJobStatus | 'all'> = [
  'all', 'open', 'in_progress', 'completed', 'disputed', 'cancelled', 'expired', 'draft',
];

function statusBadgeClass(status: WorkJobStatus): string {
  if (status === 'open') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'disputed') return 'bg-red-500/20 text-red-300';
  if (status === 'completed') return 'bg-blue-500/20 text-blue-200';
  return 'bg-white/10 text-white/60';
}

function TxLink({ label, txHash }: { label: string; txHash: string }) {
  return (
    <a
      href={workExplorerTxUrl(txHash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
    >
      <ExternalLink className="w-3 h-3" /> {label}: {txHash.slice(0, 6)}…{txHash.slice(-4)}
    </a>
  );
}

export default function WorkHistoryPage() {
  const navigate = useNavigate();
  const { walletAddress, openLoginModal } = useAuth();
  const [tab, setTab] = useState<'posted' | 'worked'>('posted');
  const [status, setStatus] = useState<WorkJobStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const { data: posted = [], isLoading: postedLoading } = useMyPostedJobs();
  const { data: submissions = [], isLoading: submissionsLoading } = useMyWorkSubmissions();

  const q = search.trim().toLowerCase();
  const filteredPosted = useMemo(() => posted.filter((j) =>
    (status === 'all' || j.status === status) && (!q || j.title.toLowerCase().includes(q))
  ), [posted, status, q]);
  const filteredSubmissions = useMemo(() => submissions.filter((s) =>
    (status === 'all' || s.job?.status === status) && (!q || s.job?.title.toLowerCase().includes(q))
  ), [submissions, status, q]);

  const isLoading = tab === 'posted' ? postedLoading : submissionsLoading;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button onClick={() => navigate('/work')} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3 mb-4">
        <ThemedIcon icon="bounties" alt="" className="w-10 h-10 shrink-0 object-contain" />
        <div>
          <h1 className="text-xl font-bold text-white">My Bounties</h1>
          <p className="text-sm text-white/60">Every bounty you've posted or worked, including completed ones and their on-chain transactions.</p>
        </div>
      </div>

      {!walletAddress ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center space-y-2">
          <Wallet className="w-8 h-8 text-white/40 mx-auto" />
          <h2 className="text-base font-semibold text-white">Connect your wallet</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto mb-3">Connect to see the bounties you've posted or worked on.</p>
          <button onClick={() => openLoginModal()} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold">Connect wallet</button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-2 mb-3">
            {(['posted', 'worked'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl text-sm transition-colors ${
                  tab === t ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
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
                placeholder="Search by title…"
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkJobStatus | 'all')}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : tab === 'posted' ? (
            filteredPosted.length === 0 ? (
              <EmptyState hasFilters={status !== 'all' || !!q} />
            ) : (
              <div className="space-y-3">
                {filteredPosted.map((job) => <PostedRow key={job.id} job={job} />)}
              </div>
            )
          ) : filteredSubmissions.length === 0 ? (
            <EmptyState hasFilters={status !== 'all' || !!q} />
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

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-16 text-white/50">
      <p>{hasFilters ? 'No bounties match these filters.' : 'Nothing here yet.'}</p>
    </div>
  );
}

function PostedRow({ job }: { job: WorkJob }) {
  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <Link to={bountyPath(job)} className="text-sm font-semibold text-white hover:underline line-clamp-1">{job.title}</Link>
        <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${statusBadgeClass(job.status)}`}>{job.status.replace('_', ' ')}</span>
      </div>
      <div className="text-xs text-white/50 mb-2">
        {job.total_budget.toLocaleString(undefined, { maximumFractionDigits: 4 })} {job.currency} · {new Date(job.created_at).toLocaleDateString()}
      </div>
      {job.fund_tx_hash ? (
        <TxLink label="Escrow tx" txHash={job.fund_tx_hash} />
      ) : (
        <span className="text-[11px] text-white/30">No on-chain tx (off-chain listing)</span>
      )}
    </div>
  );
}

function SubmissionRow({ submission }: { submission: WorkSubmission & { job: WorkJob | null } }) {
  const s = submission;
  const job = s.job;
  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        {job ? (
          <Link to={bountyPath(job)} className="text-sm font-semibold text-white hover:underline line-clamp-1">{job.title}</Link>
        ) : (
          <span className="text-sm font-semibold text-white/60">Deleted bounty</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {job && <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${statusBadgeClass(job.status)}`}>{job.status.replace('_', ' ')}</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${
            s.approval_status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
            s.approval_status === 'rejected' ? 'bg-red-500/20 text-red-300' :
            'bg-white/10 text-white/60'
          }`}>{s.approval_status}</span>
        </div>
      </div>
      <div className="text-xs text-white/50 mb-2">
        {new Date(s.created_at).toLocaleDateString()}
        {s.approval_status === 'approved' && s.payout_amount > 0 && job && ` · Paid ${s.payout_amount} ${job.currency}`}
      </div>
      {s.payout_tx_hash ? (
        <TxLink label="Payout tx" txHash={s.payout_tx_hash} />
      ) : (
        <span className="text-[11px] text-white/30">{s.approval_status === 'approved' ? 'No on-chain tx (off-chain payout)' : 'Not paid yet'}</span>
      )}
    </div>
  );
}
