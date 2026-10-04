import { isWorkAdmin } from '@/constants/app.constants';
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Star, AlertTriangle, ExternalLink, Check, X, Pencil, Wallet, Clock } from 'lucide-react';
import {
  useWorkJob, useJobApplications, useJobSubmissions, useJobReviews,
  useApplyToJob, useAwardApplicant, useSubmitProof,
  useApproveSubmission, useRejectSubmission, usePaySubmission,
  useLeaveReview, useOpenDispute, useMarkComplete, isJobEditable, useFundJob, useReleasePayment, useWorkConfig,
} from '@/features/work/hooks/use-work';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { bountyPath, bountyTitle, bountyDescription, bountyUrl, isBountyIndexable } from '@/features/work/seo';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import { TxLink, statusBadgeClass, statusLabelKey } from '@/features/work/components/TxLink';
import { WorkUser } from '@/features/work/components/WorkUser';
import { BountyShareButton } from '@/features/work/components/BountyShareButton';
import { ApplicationComments } from '@/features/work/components/ApplicationComments';
import { useJobApplicationComments } from '@/features/work/hooks/use-application-comments';
import type { WorkJob, WorkSubmission } from '@/features/work/types';

const TYPE_ICON: Record<string, ThemeIconKey> = {
  shill: 'messages',
  clipping: 'videos',
  contract: 'command',
};

/** What one accepted submission is worth: the whole budget on a contract, one unit otherwise. */
function payoutFor(job: WorkJob): number {
  return job.job_type === 'contract' ? job.total_budget : job.price_per_unit;
}

/** `payout_tx_hash` is the only proof a payout happened — the status column alone never moved money. */
function isPaid(s: WorkSubmission): boolean {
  return s.payout_state === 'confirmed' && !!s.payout_tx_hash;
}

function isAwaitingPayment(s: WorkSubmission): boolean {
  return s.approval_status === 'approved' && !s.payout_tx_hash;
}

function amount(n: number, currency: string): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency}`;
}

export default function WorkJobDetailPage() {
  // Either shape of bounty URL lands here: /bounty/<n> (canonical) or the
  // legacy /work/<uuid>. useWorkJob resolves both; everything downstream keys
  // off the row's real uuid, which is what the child tables' job_id holds.
  const { jobKey } = useParams<{ jobKey: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { walletAddress, openLoginModal } = useAuth();
  const { data: job, isLoading } = useWorkJob(jobKey);
  const jobId = job?.id;
  const { data: applications = [] } = useJobApplications(jobId);
  const applicationComments = useJobApplicationComments(job?.job_type === 'contract' ? jobId : undefined);
  const { data: submissions = [] } = useJobSubmissions(jobId);
  const { data: reviews = [] } = useJobReviews(jobId);

  const applyMutation = useApplyToJob();
  const awardMutation = useAwardApplicant();
  const submitMutation = useSubmitProof();
  const approveMutation = useApproveSubmission();
  const rejectMutation = useRejectSubmission();
  const payMutation = usePaySubmission();
  const reviewMutation = useLeaveReview();
  const disputeMutation = useOpenDispute();
  const completeMutation = useMarkComplete();
  const fundMutation=useFundJob();
  const releaseMutation=useReleasePayment();
  const {data:config}=useWorkConfig();
  const [fundingHash,setFundingHash]=useState('');

  const [coverLetter, setCoverLetter] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofText, setProofText] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-10 text-white/60">{t('work.loading')}</div>;
  if (!job) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center text-white/60">
      <ThemedIcon icon="bounties" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-75" />
      {t('work.jobNotFound')}
    </div>
  );

  const me = walletAddress?.toLowerCase();
  const isPoster = me === job.poster_address.toLowerCase();
  const canManage=(isPoster && job.status!=='disputed') || (job.status==='disputed' && isWorkAdmin(walletAddress));
  const isAwarded = me && job.awarded_worker_address && me === job.awarded_worker_address.toLowerCase();
  const myApp = applications.find(a => a.applicant_address.toLowerCase() === me);
  const myReview = reviews.find(r => r.reviewer_address.toLowerCase() === me);
  const isCompleted = job.status === 'completed';
  const accepting = ['open','in_progress'].includes(job.status) && (!job.deadline || Date.parse(job.deadline) > Date.now()) && job.units_approved < job.max_units;
  const canReview = isCompleted && (isPoster || submissions.some(s => s.worker_address.toLowerCase() === me && (s.approval_status === 'approved' || s.approval_status === 'paid')));

  // Accepted work that has not been paid. This is the number the poster owes and
  // the reason the "Mark complete" button asks before closing a job over it.
  const unpaid = submissions.filter(isAwaitingPayment);
  const owed = unpaid.reduce((sum, s) => sum + Number(s.payout_amount || payoutFor(job)), 0);

  // What the budget can still cover. Every submission card used to offer the
  // full budget on a contract bounty, so three submissions meant three
  // full-price Pay buttons for one agreed amount.
  const budgetLeft = Math.max(
    0,
    Number(job.total_budget || 0) -
      submissions
        .filter(s => !!s.payout_tx_hash)
        .reduce((sum, s) => sum + Number(s.gross_amount || s.payout_amount || 0), 0),
  );

  const requireAuth = () => { if (!me) { openLoginModal(); return false; } return true; };

  return (
    <div data-work-surface className="max-w-3xl mx-auto px-4 py-6">
      {/* Same title, description, canonical and indexability the edge worker
          serves crawlers for this URL — see src/features/work/seo.ts. */}
      <SEOHead
        title={bountyTitle(job)}
        description={bountyDescription(job)}
        url={bountyUrl(job)}
        image={job.cover_image_url || 'https://dehub.io/og/work.jpg'}
        noindex={!isBountyIndexable(job)}
      />
      <button onClick={() => navigate('/work')} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> {t('work.back')}
      </button>

      {/* Header */}
      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/80 inline-flex items-center gap-1">
              <ThemedIcon icon={TYPE_ICON[job.job_type] ?? 'bounties'} alt="" className="w-4 h-4 object-contain" /> {job.job_type}
            </span>
            {job.platform && <span className="px-2 py-0.5 rounded-md bg-white/5 text-white/60 uppercase">{job.platform}</span>}
            <span className={`px-2 py-0.5 rounded-md ${statusBadgeClass(job.status)}`}>{t(statusLabelKey(job.status))}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
          <BountyShareButton job={job} />
          {isPoster && isJobEditable(job) && (
            <button
              onClick={() => navigate(`${bountyPath(job)}/edit`)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Pencil className="w-3 h-3" /> {t('work.edit')}
            </button>
          )}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{job.title}</h1>
        <p className="text-sm text-white/70 whitespace-pre-wrap mb-4">{job.description}</p>
        {job.target_url && (
          <a href={job.target_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white mb-4">
            <ExternalLink className="w-3 h-3" /> {job.target_url}
          </a>
        )}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
          <Stat label={t('work.statTotal')} value={amount(job.total_budget, job.currency)} />
          {job.job_type !== 'contract' ? (
            <Stat label={t('work.statPerUnit')} value={amount(job.price_per_unit, job.currency)} />
          ) : <Stat label={t('work.statType')} value={t('work.typeContract')} />}
          <Stat label={t('work.statSlots')} value={`${job.units_approved}/${job.max_units}`} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-white/40 shrink-0">{t('work.postedBy')}</span>
            <WorkUser address={job.poster_address} />
          </div>
          {job.fund_tx_hash && <TxLink label={t('work.escrowFunded')} txHash={job.fund_tx_hash} />}
        </div>
      </div>

      <p className="mb-4 text-xs text-white/60">{t(job.fund_tx_hash?'work.integrity.escrowFunded':job.status==='draft'?'work.integrity.draftSaved':'work.integrity.legacyUnfunded')}</p>
      {isPoster && job.status==='draft' && <div className="mb-4 rounded-xl border border-white/20 p-4 space-y-3">
        <p className="text-sm text-white/80">{t('work.integrity.draftFunding')}</p>
        {!config?.escrow_address && <p className="text-sm text-amber-200">{t('work.integrity.setupRequired')}</p>}
        {job.funding_state!=='unfunded' && <input aria-label={t('work.integrity.recoverTx')} placeholder={t('work.integrity.hashPlaceholder')} value={fundingHash} onChange={e=>setFundingHash(e.target.value.trim())} className={inputCls} />}
        <button disabled={fundMutation.isPending || !config?.escrow_address} onClick={()=>fundMutation.mutate({job_id:job.id,hash:fundingHash || undefined})} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40">
          {t(job.funding_state==='unfunded'?'work.integrity.fundPublish':'work.integrity.checkFunding')}
        </button>
        {job.funding_state==='signing' && <button onClick={()=>{if(window.confirm(t('work.integrity.releaseConfirm'))) fundMutation.mutate({job_id:job.id,release:true});}} className="ml-3 text-xs text-white/70">{t('work.integrity.releaseSignature')}</button>}
      </div>}

      {/* What the poster still owes. Shown only to them, and only when there is
          accepted work with no payout transaction behind it. */}
      {isPoster && unpaid.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3">
          <Clock className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="text-sm text-amber-100">
            {t('work.awaitingPayment', { count: unpaid.length, amount: amount(owed, job.currency) })}
          </span>
        </div>
      )}

      {/* Contract: applications */}
      {job.job_type === 'contract' && (
        <Section title={t('work.applicants', { count: applications.length })}>
          {applicationComments.isError && (
            <div role="alert" className="mb-3 text-sm text-white/60">
              {t('comments.loadFailed')}
              <button onClick={() => applicationComments.refetch()} className="ml-2 underline">{t('common.tryAgain')}</button>
            </div>
          )}
          {!isPoster && !myApp && !isAwarded && job.status === 'open' && accepting && (
            <div className="mb-4 space-y-2">
              <textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder={t('work.coverLetterPlaceholder')}
                rows={3}
                className={inputCls}
              />
              <button
                disabled={!coverLetter.trim() || applyMutation.isPending}
                onClick={() => { if (!requireAuth()) return; applyMutation.mutate({ job_id: job.id, cover_letter: coverLetter.trim() }, { onSuccess: () => setCoverLetter('') }); }}
                className="px-4 py-2 rounded-xl bg-white text-black font-semibold disabled:opacity-40"
              >
                {t('work.apply')}
              </button>
            </div>
          )}
          {applications.length === 0 ? (
            <p className="text-sm text-white/50">{t('work.noApplicants')}</p>
          ) : applications.map(a => (
            <div key={a.id} className="p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <WorkUser address={a.applicant_address} />
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-md ${a.status === 'awarded' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{t(statusLabelKey(a.status))}</span>
              </div>
              <p className="text-sm text-white/70 whitespace-pre-wrap">{a.cover_letter}</p>
              <ApplicationComments
                application={a}
                comments={(applicationComments.data ?? []).filter(comment => comment.application_id === a.id)}
                canReply={isPoster || a.applicant_address.toLowerCase() === me}
              />
              {isPoster && a.status === 'pending' && job.status === 'open' && (
                <button
                  onClick={() => awardMutation.mutate({ job_id: job.id, onchain_job_id: job.onchain_job_id, application_id: a.id, worker_address: a.applicant_address })}
                  disabled={awardMutation.isPending}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold disabled:opacity-40"
                >
                  {t('work.awardApplicant')}
                </button>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Submissions / proof feed */}
      {(job.job_type !== 'contract' || isAwarded || canManage) && (
        <Section title={t('work.submissions', { count: submissions.length })}>
          {((job.job_type !== 'contract' && !isPoster) || isAwarded) && accepting && (
            <div className="mb-4 space-y-2">
              <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder={t('work.proofUrlPlaceholder')} className={inputCls} />
              <textarea value={proofText} onChange={(e) => setProofText(e.target.value)} rows={2} placeholder={t('work.notesPlaceholder')} className={inputCls} />
              <button
                disabled={!proofUrl.trim() || submitMutation.isPending}
                onClick={() => {
                  if (!requireAuth()) return;
                  submitMutation.mutate({ job_id: job.id, proof_url: proofUrl.trim(), proof_text: proofText.trim(), platform: job.platform ?? undefined }, {
                    onSuccess: () => { setProofUrl(''); setProofText(''); }
                  });
                }}
                className="px-4 py-2 rounded-xl bg-white text-black font-semibold disabled:opacity-40"
              >
                {t('work.submitProof')}
              </button>
            </div>
          )}
          {submissions.length === 0 ? (
            <p className="text-sm text-white/50">{t('work.noSubmissions')}</p>
          ) : submissions.map(s => (
            <SubmissionCard
              key={s.id}
              submission={s}
              job={job}
              isPoster={canManage}
              canPay={isPoster || !!job.fund_tx_hash}
              isMine={s.worker_address.toLowerCase() === me}
              onApprove={(pay, views, evidence) => approveMutation.mutate({
                submission_id: s.id,
                job_id: job.id,
                onchain_job_id: job.onchain_job_id,
                currency: job.currency,
                worker_address: s.worker_address,
                payout_amount: payoutFor(job),
                total_budget: job.total_budget,
                pay,
                views,
                evidence_url: evidence,
              })}
              onPay={(recoveryHash) => payMutation.mutate({
                submission_id: s.id,
                job_id: job.id,
                onchain_job_id: job.onchain_job_id,
                currency: job.currency,
                worker_address: s.worker_address,
                payout_amount: Number(s.payout_amount) || payoutFor(job),
                total_budget: job.total_budget,
                recovery_hash: recoveryHash,
              })}
              onRelease={()=>{if(window.confirm(t('work.integrity.releaseConfirm'))) releaseMutation.mutate(s.id);}}
              onReject={(reason) => rejectMutation.mutate({ submission_id: s.id, job_id: job.id, reason })}
              budgetLeft={budgetLeft}
              busy={approveMutation.isPending || payMutation.isPending || rejectMutation.isPending}
            />
          ))}
        </Section>
      )}

      {/* Reviews */}
      <Section title={t('work.reviews', { count: reviews.length })}>
        {canReview && !myReview && (
          <div className="mb-4 space-y-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-white/30'}`} />
                </button>
              ))}
            </div>
            <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} placeholder={t('work.reviewPlaceholder')} className={inputCls} />
            <button
              onClick={() => {
                const reviewee = isPoster
                  ? submissions.find(s => s.approval_status === 'approved' || s.approval_status === 'paid')?.worker_address ?? job.awarded_worker_address
                  : job.poster_address;
                if (!reviewee) { toast.error(t('work.noCounterparty')); return; }
                reviewMutation.mutate({
                  job_id: job.id,
                  reviewee_address: reviewee,
                  reviewer_role: isPoster ? 'poster' : 'worker',
                  rating,
                  comment: reviewComment.trim(),
                }, { onSuccess: () => setReviewComment('') });
              }}
              className="px-4 py-2 rounded-xl bg-white text-black font-semibold"
            >
              {t('work.postReview')}
            </button>
          </div>
        )}
        {reviews.length === 0 ? (
          <p className="text-sm text-white/50">{t('work.noReviews')}</p>
        ) : reviews.map(r => (
          <div key={r.id} className="p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
            <div className="flex items-center justify-between gap-3">
              <WorkUser address={r.reviewer_address} />
              <div className="flex gap-0.5 shrink-0">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-white/20'}`} />
                ))}
              </div>
            </div>
            {r.comment && <p className="text-sm text-white/70 mt-2">{r.comment}</p>}
          </div>
        ))}
      </Section>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {isPoster && ['open','in_progress','expired'].includes(job.status) && (
          <button
            onClick={() => {
              // Closing a job over unpaid accepted work is how the current
              // backlog was created — the status said completed and the worker
              // was never paid. Make the poster say it out loud.
              if (unpaid.length > 0 && !window.confirm(
                t('work.markCompleteConfirm', { count: unpaid.length, amount: amount(owed, job.currency) })
              )) return;
              completeMutation.mutate(job.id);
            }}
            disabled={completeMutation.isPending}
            className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40"
          >
            {t('work.markComplete')}
          </button>
        )}
        {(isPoster || isAwarded) && job.status !== 'completed' && job.status !== 'disputed' && (
          <button onClick={() => setShowDispute(s => !s)} className="px-4 py-2 rounded-xl bg-red-500/20 text-red-200 text-sm inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {t('work.openDispute')}
          </button>
        )}
      </div>

      {showDispute && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
          <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} rows={3} placeholder={t('work.disputePlaceholder')} className={inputCls} />
          <button
            disabled={!disputeReason.trim()}
            onClick={() => { disputeMutation.mutate({ job_id: job.id, onchain_job_id: job.onchain_job_id, reason: disputeReason.trim() }); setShowDispute(false); setDisputeReason(''); }}
            className="px-4 py-2 rounded-xl bg-red-500/30 text-red-100 text-sm font-semibold"
          >
            {t('work.submitDispute')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One proof submission, in whichever of its four states it is in: pending,
 * approved-but-unpaid, paid, or rejected.
 *
 * The approved-but-unpaid state is the one that matters. Approval and payment
 * were a single button that only ever wrote a status column, so that state is
 * both extremely common and previously invisible — it rendered as "Paid" with
 * no transaction behind it. It now says what it is and carries the button that
 * settles it.
 */
function SubmissionCard({
  submission: s,
  job,
  isPoster,
  isMine,
  canPay,
  onApprove,
  onPay,
  onReject,
  onRelease,
  busy,
  budgetLeft,
}: {
  submission: WorkSubmission;
  job: WorkJob;
  isPoster: boolean;
  isMine: boolean;
  canPay:boolean;
  onApprove: (pay: boolean, views?: number, evidence?: string) => void;
  onPay: (recoveryHash?: string) => void;
  onReject: (reason: string) => void;
  onRelease:()=>void;
  busy: boolean;
  budgetLeft: number;
}) {
  const { t } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [views, setViews] = useState('');
  const [viewEvidence, setViewEvidence] = useState(s.proof_url);
  const [recoveryHash, setRecoveryHash] = useState('');

  const paid = isPaid(s);
  const awaiting = isAwaitingPayment(s);
  const clipping = job.job_type === 'clipping';
  const verifiedViews = Number(views);
  const clipUnits = Number.isSafeInteger(verifiedViews) && verifiedViews >= 1000 ? Math.floor(verifiedViews / 1000) : 0;
  const validViews = !clipping || (clipUnits > 0 && /^https:\/\/\S+$/.test(viewEvidence));
  const gross=Number(s.gross_amount) || (clipping ? clipUnits*job.price_per_unit:payoutFor(job));
  const due=Number(s.payout_amount) || gross*(job.fund_tx_hash?0.95:1);
  const submittedPayment = s.payout_state === 'signing' || s.payout_state === 'broadcast';
  // A rounding-sized shortfall is the token's own precision, not an overspend.
  const affordable = gross - budgetLeft <= 1e-9;

  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* The address rides along under the name here: this is the wallet the
            payout transfer goes to, and the poster should be able to check it. */}
        <WorkUser address={s.worker_address} showAddress={isPoster} />
        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-md ${
          paid ? 'bg-emerald-500/20 text-emerald-300' :
          awaiting ? 'bg-amber-400/20 text-amber-200' :
          s.approval_status === 'rejected' ? 'bg-red-500/20 text-red-300' :
          'bg-white/10 text-white/60'
        }`}>
          {paid ? t('work.statusPaid') : awaiting ? t('work.statusAwaitingPayment') : t(statusLabelKey(s.approval_status))}
        </span>
      </div>

      <a href={s.proof_url} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1 break-all">
        <ExternalLink className="w-3 h-3 flex-shrink-0" /> {s.proof_url}
      </a>
      {s.proof_text && <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{s.proof_text}</p>}
      {s.rejection_reason && (
        <p className="text-xs text-red-300/80 mt-1">{t('work.rejectedReason', { reason: s.rejection_reason })}</p>
      )}

      {paid && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2">
          <span className="text-[11px] text-emerald-300">{t('work.paidAmount', { amount: amount(Number(s.payout_amount), job.currency) })}</span>
          {s.payout_tx_hash && <TxLink label={t('work.payoutTx')} txHash={s.payout_tx_hash} chain={s.payout_chain_id ?? 8453} />}
        </div>
      )}

      {awaiting && (
        <p className="mt-2 text-[11px] text-amber-200/80">
          {isMine
            ? t('work.acceptedMine', { amount: amount(due, job.currency) })
            : t('work.acceptedOther', { amount: amount(due, job.currency) })}
        </p>
      )}

      {s.view_count_cached > 0 && <p className="mt-2 text-xs text-white/60">{t('work.integrity.viewsAccepted',{count:s.view_count_cached,units:s.approved_units})}</p>}
      {isPoster && clipping && s.approval_status === 'pending' && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-white/60">{t('work.integrity.verifiedViews')}
            <input type="number" min={1000} step={1} value={views} onChange={e => setViews(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs text-white/60">{t('work.integrity.viewSource')}
            <input type="url" value={viewEvidence} onChange={e => setViewEvidence(e.target.value)} className={inputCls} />
          </label>
          <p className="text-xs text-white/50">{t('work.integrity.clipVerify')}</p>
        </div>
      )}
      {job.fund_tx_hash && <p className="mt-2 text-xs text-white/60">{t('work.integrity.feeNotice',{net:due,currency:job.currency,gross})}</p>}
      {/* Poster: accept + pay */}
      {isPoster && s.approval_status === 'pending' && !rejecting && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            hidden={!canPay} onClick={() => onApprove(true, clipping ? verifiedViews : undefined, clipping ? viewEvidence : undefined)}
            disabled={busy || !affordable || !validViews}
            title={affordable ? undefined : t('work.budgetExhausted')}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <Wallet className="w-3 h-3" /> {t('work.approveAndPay', { amount: amount(due, job.currency) })}
          </button>
          <button
            onClick={() => onApprove(false, clipping ? verifiedViews : undefined, clipping ? viewEvidence : undefined)}
            disabled={busy || !validViews || !affordable}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 text-xs font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <Check className="w-3 h-3" /> {t('work.approveOnly')}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <X className="w-3 h-3" /> {t('work.reject')}
          </button>
        </div>
      )}

      {isPoster && !paid && !affordable && (
        <p className="mt-2 text-[11px] text-red-300/80">{t('work.budgetExhausted')}</p>
      )}

      {/* Poster: settle something already accepted. */}
      {isPoster && s.payout_state === 'signing' && (
        <label className="block mt-3 text-xs text-white/60">{t('work.integrity.recoverTx')}
          <input value={recoveryHash} onChange={e => setRecoveryHash(e.target.value.trim())} placeholder={t('work.integrity.hashPlaceholder')} className={inputCls} />
        </label>
      )}
      {isPoster && s.payout_state==='signing' && <button onClick={onRelease} className="mt-2 text-xs text-white/60">{t('work.integrity.releaseSignature')}</button>}
      {submittedPayment && <p className="mt-2 text-xs text-white/60">{t('work.integrity.paymentPending')}</p>}
      {isPoster && canPay && awaiting && (
        <button
          onClick={() => onPay(recoveryHash || undefined)}
          disabled={busy || !affordable}
          title={affordable ? undefined : t('work.budgetExhausted')}
          className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-40"
        >
          <Wallet className="w-3 h-3" /> {submittedPayment ? t('work.integrity.checkPayment') : t('work.payAmount', { amount: amount(due, job.currency) })}
        </button>
      )}

      {/* An inline reason beats window.prompt: it is themed, it survives a
          mis-click, and it does not block the page. */}
      {isPoster && rejecting && (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder={t('work.rejectReasonPlaceholder')}
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onReject(reason.trim()); setRejecting(false); setReason(''); }}
              disabled={!reason.trim() || busy}
              className="px-3 py-1.5 rounded-lg bg-red-500/30 text-red-100 text-xs font-semibold disabled:opacity-40"
            >
              {t('work.confirmRejection')}
            </button>
            <button
              onClick={() => { setRejecting(false); setReason(''); }}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-medium"
            >
              {t('work.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-5 mb-4">
      <h2 className="text-sm font-semibold text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-white/40 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
