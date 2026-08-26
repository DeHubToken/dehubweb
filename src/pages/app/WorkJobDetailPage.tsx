import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Star, AlertTriangle, ExternalLink, Check, X, Pencil, Wallet, Clock } from 'lucide-react';
import {
  useWorkJob, useJobApplications, useJobSubmissions, useJobReviews,
  useApplyToJob, useAwardApplicant, useSubmitProof,
  useApproveSubmission, useRejectSubmission, usePaySubmission,
  useLeaveReview, useOpenDispute, useMarkComplete, isJobEditable,
} from '@/features/work/hooks/use-work';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { bountyPath, bountyTitle, bountyDescription, bountyUrl, isBountyIndexable } from '@/features/work/seo';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { TxLink, statusBadgeClass, statusLabel } from '@/features/work/components/TxLink';
import { WorkUser } from '@/features/work/components/WorkUser';
import type { WorkJob, WorkSubmission } from '@/features/work/types';

/** What one accepted submission is worth: the whole budget on a contract, one unit otherwise. */
function payoutFor(job: WorkJob): number {
  return job.job_type === 'contract' ? job.total_budget : job.price_per_unit;
}

/** `payout_tx_hash` is the only proof a payout happened â€” the status column alone never moved money. */
function isPaid(s: WorkSubmission): boolean {
  return !!s.payout_tx_hash || s.approval_status === 'paid';
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
  const { walletAddress, openLoginModal } = useAuth();
  const { data: job, isLoading } = useWorkJob(jobKey);
  const jobId = job?.id;
  const { data: applications = [] } = useJobApplications(jobId);
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

  const [coverLetter, setCoverLetter] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofText, setProofText] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-10 text-white/60">Loadingâ€¦</div>;
  if (!job) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center text-white/60">
      <ThemedIcon icon="bounties" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-75" />
      Job not found.
    </div>
  );

  const me = walletAddress?.toLowerCase();
  const isPoster = me === job.poster_address.toLowerCase();
  const isAwarded = me && job.awarded_worker_address && me === job.awarded_worker_address.toLowerCase();
  const myApp = applications.find(a => a.applicant_address.toLowerCase() === me);
  const myReview = reviews.find(r => r.reviewer_address.toLowerCase() === me);
  const isCompleted = job.status === 'completed';
  const canReview = isCompleted && (isPoster || submissions.some(s => s.worker_address.toLowerCase() === me && (s.approval_status === 'approved' || s.approval_status === 'paid')));

  // Accepted work that has not been paid. This is the number the poster owes and
  // the reason the "Mark complete" button asks before closing a job over it.
  const unpaid = submissions.filter(isAwaitingPayment);
  const owed = unpaid.reduce((sum, s) => sum + Number(s.payout_amount || payoutFor(job)), 0);

  const requireAuth = () => { if (!me) { openLoginModal(); return false; } return true; };

  return (
    <div data-work-surface className="max-w-3xl mx-auto px-4 py-6">
      {/* Same title, description, canonical and indexability the edge worker
          serves crawlers for this URL â€” see src/features/work/seo.ts. */}
      <SEOHead
        title={bountyTitle(job)}
        description={bountyDescription(job)}
        url={bountyUrl(job)}
        image={job.cover_image_url || 'https://dehub.io/og/work.jpg'}
        noindex={!isBountyIndexable(job)}
      />
      <button onClick={() => navigate('/work')} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/80 inline-flex items-center gap-1">
              <Briefcase className="w-3 h-3" /> {job.job_type}
            </span>
            {job.platform && <span className="px-2 py-0.5 rounded-md bg-white/5 text-white/60 uppercase">{job.platform}</span>}
            <span className={`px-2 py-0.5 rounded-md ${statusBadgeClass(job.status)}`}>{statusLabel(job.status)}</span>
          </div>
          {isPoster && isJobEditable(job) && (
            <button
              onClick={() => navigate(`${bountyPath(job)}/edit`)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{job.title}</h1>
        <p className="text-sm text-white/70 whitespace-pre-wrap mb-4">{job.description}</p>
        {job.target_url && (
          <a href={job.target_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white mb-4">
            <ExternalLink className="w-3 h-3" /> {job.target_url}
          </a>
        )}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
          <Stat label="Total" value={amount(job.total_budget, job.currency)} />
          {job.job_type !== 'contract' ? (
            <Stat label="Per unit" value={amount(job.price_per_unit, job.currency)} />
          ) : <Stat label="Type" value="Contract" />}
          <Stat label="Slots" value={`${job.units_approved}/${job.max_units}`} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-white/40 shrink-0">Posted by</span>
            <WorkUser address={job.poster_address} />
          </div>
          {job.fund_tx_hash && <TxLink label="Escrow funded" txHash={job.fund_tx_hash} />}
        </div>
      </div>

      {/* What the poster still owes. Shown only to them, and only when there is
          accepted work with no payout transaction behind it. */}
      {isPoster && unpaid.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3">
          <Clock className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="text-sm text-amber-100">
            {unpaid.length} approved {unpaid.length === 1 ? 'submission is' : 'submissions are'} awaiting payment â€”{' '}
            <strong className="font-semibold">{amount(owed, job.currency)}</strong>
          </span>
        </div>
      )}

      {/* Contract: applications */}
      {job.job_type === 'contract' && (
        <Section title={`Applicants (${applications.length})`}>
          {!isPoster && !myApp && !isAwarded && job.status === 'open' && (
            <div className="mb-4 space-y-2">
              <textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="Why are you a good fit?"
                rows={3}
                className={inputCls}
              />
              <button
                disabled={!coverLetter.trim() || applyMutation.isPending}
                onClick={() => { if (!requireAuth()) return; applyMutation.mutate({ job_id: job.id, cover_letter: coverLetter.trim() }, { onSuccess: () => setCoverLetter('') }); }}
                className="px-4 py-2 rounded-xl bg-white text-black font-semibold disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          )}
          {applications.length === 0 ? (
            <p className="text-sm text-white/50">No applicants yet.</p>
          ) : applications.map(a => (
            <div key={a.id} className="p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <WorkUser address={a.applicant_address} />
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-md ${a.status === 'awarded' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{a.status}</span>
              </div>
              <p className="text-sm text-white/70 whitespace-pre-wrap">{a.cover_letter}</p>
              {isPoster && a.status === 'pending' && job.status === 'open' && (
                <button
                  onClick={() => awardMutation.mutate({ job_id: job.id, onchain_job_id: job.onchain_job_id, application_id: a.id, worker_address: a.applicant_address })}
                  disabled={awardMutation.isPending}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold disabled:opacity-40"
                >
                  Award this applicant
                </button>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Submissions / proof feed */}
      {(job.job_type !== 'contract' || isAwarded || isPoster) && (
        <Section title={`Submissions (${submissions.length})`}>
          {((job.job_type !== 'contract' && !isPoster) || isAwarded) && job.status !== 'completed' && job.status !== 'cancelled' && (
            <div className="mb-4 space-y-2">
              <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Proof URL (link to post / clip / comment)" className={inputCls} />
              <textarea value={proofText} onChange={(e) => setProofText(e.target.value)} rows={2} placeholder="Notes (optional)" className={inputCls} />
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
                Submit proof
              </button>
            </div>
          )}
          {submissions.length === 0 ? (
            <p className="text-sm text-white/50">No submissions yet.</p>
          ) : submissions.map(s => (
            <SubmissionCard
              key={s.id}
              submission={s}
              job={job}
              isPoster={isPoster}
              isMine={s.worker_address.toLowerCase() === me}
              onApprove={(pay) => approveMutation.mutate({
                submission_id: s.id,
                job_id: job.id,
                onchain_job_id: job.onchain_job_id,
                currency: job.currency,
                worker_address: s.worker_address,
                payout_amount: payoutFor(job),
                pay,
              })}
              onPay={() => payMutation.mutate({
                submission_id: s.id,
                job_id: job.id,
                onchain_job_id: job.onchain_job_id,
                currency: job.currency,
                worker_address: s.worker_address,
                payout_amount: Number(s.payout_amount) || payoutFor(job),
              })}
              onReject={(reason) => rejectMutation.mutate({ submission_id: s.id, job_id: job.id, reason })}
              busy={approveMutation.isPending || payMutation.isPending || rejectMutation.isPending}
            />
          ))}
        </Section>
      )}

      {/* Reviews */}
      <Section title={`Reviews (${reviews.length})`}>
        {canReview && !myReview && (
          <div className="mb-4 space-y-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-white/30'}`} />
                </button>
              ))}
            </div>
            <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} placeholder="Share your experienceâ€¦" className={inputCls} />
            <button
              onClick={() => {
                const reviewee = isPoster
                  ? submissions.find(s => s.approval_status === 'approved' || s.approval_status === 'paid')?.worker_address ?? job.awarded_worker_address
                  : job.poster_address;
                if (!reviewee) { toast.error('No counterparty to review'); return; }
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
              Post review
            </button>
          </div>
        )}
        {reviews.length === 0 ? (
          <p className="text-sm text-white/50">No reviews yet.</p>
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
        {isPoster && job.status === 'in_progress' && (
          <button
            onClick={() => {
              // Closing a job over unpaid accepted work is how the current
              // backlog was created â€” the status said completed and the worker
              // was never paid. Make the poster say it out loud.
              if (unpaid.length > 0 && !window.confirm(
                `${unpaid.length} approved ${unpaid.length === 1 ? 'submission has' : 'submissions have'} not been paid (${amount(owed, job.currency)}). Mark this bounty complete anyway?`
              )) return;
              completeMutation.mutate(job.id);
            }}
            disabled={completeMutation.isPending}
            className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40"
          >
            Mark complete
          </button>
        )}
        {(isPoster || isAwarded) && job.status !== 'completed' && job.status !== 'disputed' && (
          <button onClick={() => setShowDispute(s => !s)} className="px-4 py-2 rounded-xl bg-red-500/20 text-red-200 text-sm inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Open dispute
          </button>
        )}
      </div>

      {showDispute && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
          <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} rows={3} placeholder="Explain the issueâ€¦" className={inputCls} />
          <button
            disabled={!disputeReason.trim()}
            onClick={() => { disputeMutation.mutate({ job_id: job.id, onchain_job_id: job.onchain_job_id, reason: disputeReason.trim() }); setShowDispute(false); setDisputeReason(''); }}
            className="px-4 py-2 rounded-xl bg-red-500/30 text-red-100 text-sm font-semibold"
          >
            Submit dispute to admin
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
 * both extremely common and previously invisible â€” it rendered as "Paid" with
 * no transaction behind it. It now says what it is and carries the button that
 * settles it.
 */
function SubmissionCard({
  submission: s,
  job,
  isPoster,
  isMine,
  onApprove,
  onPay,
  onReject,
  busy,
}: {
  submission: WorkSubmission;
  job: WorkJob;
  isPoster: boolean;
  isMine: boolean;
  onApprove: (pay: boolean) => void;
  onPay: () => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const paid = isPaid(s);
  const awaiting = isAwaitingPayment(s);
  const due = Number(s.payout_amount) || payoutFor(job);

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
          {paid ? 'paid' : awaiting ? 'awaiting payment' : s.approval_status}
        </span>
      </div>

      <a href={s.proof_url} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1 break-all">
        <ExternalLink className="w-3 h-3 flex-shrink-0" /> {s.proof_url}
      </a>
      {s.proof_text && <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{s.proof_text}</p>}
      {s.rejection_reason && (
        <p className="text-xs text-red-300/80 mt-1">Rejected: {s.rejection_reason}</p>
      )}

      {paid && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2">
          <span className="text-[11px] text-emerald-300">Paid {amount(Number(s.payout_amount), job.currency)}</span>
          {s.payout_tx_hash && <TxLink label="Payout tx" txHash={s.payout_tx_hash} />}
        </div>
      )}

      {awaiting && (
        <p className="mt-2 text-[11px] text-amber-200/80">
          {isMine
            ? `Accepted â€” ${amount(due, job.currency)} has not been sent yet.`
            : `Accepted, not paid â€” ${amount(due, job.currency)} outstanding.`}
        </p>
      )}

      {/* Poster: accept + pay */}
      {isPoster && s.approval_status === 'pending' && !rejecting && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => onApprove(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <Wallet className="w-3 h-3" /> Approve &amp; pay {amount(due, job.currency)}
          </button>
          <button
            onClick={() => onApprove(false)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 text-xs font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <Check className="w-3 h-3" /> Approve only
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <X className="w-3 h-3" /> Reject
          </button>
        </div>
      )}

      {/* Poster: settle something already accepted. */}
      {isPoster && awaiting && (
        <button
          onClick={onPay}
          disabled={busy}
          className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-40"
        >
          <Wallet className="w-3 h-3" /> Pay {amount(due, job.currency)}
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
            placeholder="Why is this being rejected?"
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onReject(reason.trim()); setRejecting(false); setReason(''); }}
              disabled={!reason.trim() || busy}
              className="px-3 py-1.5 rounded-lg bg-red-500/30 text-red-100 text-xs font-semibold disabled:opacity-40"
            >
              Confirm rejection
            </button>
            <button
              onClick={() => { setRejecting(false); setReason(''); }}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-medium"
            >
              Cancel
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
