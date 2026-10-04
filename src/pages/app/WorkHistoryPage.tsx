import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, AlertTriangle, Plus } from 'lucide-react';
import { useMyPostedJobs, useMyWorkSubmissions } from '@/features/work/hooks/use-work';
import { bountyPath } from '@/features/work/seo';
import { TxLink, statusBadgeClass, statusLabelKey } from '@/features/work/components/TxLink';
import type { WorkJob, WorkJobStatus, WorkSubmission } from '@/features/work/types';
import { useAuth } from '@/contexts/AuthContext';

import { SEOHead } from '@/components/SEOHead';
import { KitButton, PageBody, PageEmpty, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';

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
  const { t } = useTranslation();
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
    <div data-work-surface className="min-h-screen">
      {/* Authed, per-wallet page: never indexable, but it still needs its own
          head or it inherits the title and canonical of whatever route came
          before it — see src/lib/head-meta.ts. */}
      <SEOHead
        title="My Bounties | DeHub"
        description="Every bounty you've posted or worked on DeHub, with their on-chain escrow and payout transactions."
        url="https://dehub.io/work/history"
        noindex
      />

      <PageIsland
        back
        onBack={() => navigate('/work')}
        icon="bounties"
        title={t('work.myBounties')}
        subtitle={t('work.historySubtitle')}
        tabs={
          walletAddress ? (
            <PageTabs
              value={tab}
              onChange={switchTab}
              tabs={[
                { id: 'posted', label: t('work.tabPosted') },
                { id: 'worked', label: t('work.tabWorked') },
              ]}
            />
          ) : undefined
        }
      >
        {walletAddress ? (
          /* Filter bar */
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('work.searchYourBounties')}
                placeholder={t('work.searchByTitle')}
                className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkJobStatus | 'all')}
              aria-label={t('work.filterByStatus')}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
            >
              {STATUS_OPTIONS[tab].map((s) => (
                <option key={s} value={s}>{s === 'all' ? t('work.allStatuses') : t(statusLabelKey(s))}</option>
              ))}
            </select>
          </div>
        ) : null}
      </PageIsland>

      <PageBody className="max-w-3xl mx-auto">
      {!walletAddress ? (
        <PageEmpty
          icon="lock"
          title={t('work.connectTitle')}
          body={t('work.connectBody')}
          action={<KitButton variant="primary" onClick={() => openLoginModal()}>{t('work.connectCta')}</KitButton>}
        />
      ) : (
        <>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            /* Without this branch a failed query falls through to the empty
               state and tells a poster with 40 bounties they have none. */
            <PageEmpty
              icon={<AlertTriangle className="w-8 h-8 text-white/40" />}
              title={t('work.loadFailed')}
              action={<KitButton variant="quiet" onClick={() => refetch()}>{t('work.tryAgain')}</KitButton>}
            />
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
      </PageBody>
    </div>
  );
}

function EmptyState({ tab, hasFilters, onClear }: { tab: Tab; hasFilters: boolean; onClear: () => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <PageEmpty
      icon="bounties"
      title={
        hasFilters
          ? t('work.emptyFilteredHistory')
          : tab === 'posted'
            ? t('work.emptyPosted')
            : t('work.emptyWorked')
      }
      action={
        hasFilters ? (
          <KitButton variant="quiet" onClick={onClear}>
            {t('work.clearFilters')}
          </KitButton>
        ) : tab === 'posted' ? (
          <KitButton variant="primary" onClick={() => navigate('/work/post')}>
            <Plus className="w-4 h-4" /> {t('work.postBounty')}
          </KitButton>
        ) : (
          <KitButton variant="primary" onClick={() => navigate('/work')}>
            {t('work.browseBounties')}
          </KitButton>
        )
      }
    />
  );
}

function PostedRow({ job }: { job: WorkJob }) {
  const { t } = useTranslation();
  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <Link to={bountyPath(job)} className="text-sm font-semibold text-white hover:underline line-clamp-1">{job.title}</Link>
        <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${statusBadgeClass(job.status)}`}>{t(statusLabelKey(job.status))}</span>
      </div>
      <div className="text-xs text-white/50">
        {job.total_budget.toLocaleString('en-US', { maximumFractionDigits: 4 })} {job.currency} · {new Date(job.created_at).toLocaleDateString()}
      </div>
      {/* Until the escrow contract is deployed nothing ever writes a hash, so
          the "no tx" note would be the most-repeated line on the page. */}
      {job.fund_tx_hash ? (
        <div className="mt-2"><TxLink label={t('work.escrowTx')} txHash={job.fund_tx_hash} /></div>
      ) : (
        <div className="mt-2 text-[11px] text-white/30">{t('work.integrity.payOnApproval')}</div>
      )}
    </div>
  );
}

function SubmissionRow({ submission: s }: { submission: WorkSubmission & { job: WorkJob | null } }) {
  const { t } = useTranslation();
  const job = s.job;
  // Approved is not paid. Treating the two as one status is what let ~500k DHB
  // of accepted work show a green "paid" tick on this very page while no
  // transfer had happened — a payout is real only once it has a tx hash.
  const paid = s.payout_state === 'confirmed' && !!s.payout_tx_hash;
  const awaitingPayment = s.approval_status === 'approved' && !s.payout_tx_hash;
  const due = Number(s.payout_amount) || 0;

  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        {job ? (
          <Link to={bountyPath(job)} className="text-sm font-semibold text-white hover:underline line-clamp-1">{job.title}</Link>
        ) : (
          <span className="text-sm font-semibold text-white/60">{t('work.untitledBounty')}</span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {job && <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${statusBadgeClass(job.status)}`}>{t(statusLabelKey(job.status))}</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap ${
            paid ? 'bg-emerald-500/20 text-emerald-300' :
            awaitingPayment ? 'bg-amber-400/20 text-amber-200' :
            s.approval_status === 'rejected' ? 'bg-red-500/20 text-red-300' :
            'bg-white/10 text-white/60'
          }`}>
            {paid ? t('work.statusPaid') : awaitingPayment ? t('work.statusAwaitingPayment') : t(statusLabelKey(s.approval_status))}
          </span>
        </div>
      </div>
      <div className="text-xs text-white/50">
        {new Date(s.created_at).toLocaleDateString()}
        {(paid || awaitingPayment) && due > 0 && job && ` · ${due.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${job.currency}`}
      </div>
      {s.payout_tx_hash ? (
        <div className="mt-2"><TxLink label={t('work.payoutTx')} txHash={s.payout_tx_hash} chain={s.payout_chain_id ?? 8453} /></div>
      ) : awaitingPayment ? (
        <div className="mt-2 text-[11px] text-amber-200/70">
          {t('work.acceptedNotSent')}
        </div>
      ) : null}
    </div>
  );
}
