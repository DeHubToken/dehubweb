import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Star, AlertTriangle, ExternalLink, Check, X } from 'lucide-react';
import {
  useWorkJob, useJobApplications, useJobSubmissions, useJobReviews,
  useApplyToJob, useAwardApplicant, useSubmitProof,
  useApproveSubmission, useRejectSubmission,
  useLeaveReview, useOpenDispute, useMarkComplete,
} from '@/features/work/hooks/use-work';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function WorkJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { walletAddress, openLoginModal } = useAuth();
  const { data: job, isLoading } = useWorkJob(jobId);
  const { data: applications = [] } = useJobApplications(jobId);
  const { data: submissions = [] } = useJobSubmissions(jobId);
  const { data: reviews = [] } = useJobReviews(jobId);

  const applyMutation = useApplyToJob();
  const awardMutation = useAwardApplicant();
  const submitMutation = useSubmitProof();
  const approveMutation = useApproveSubmission();
  const rejectMutation = useRejectSubmission();
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

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-10 text-white/60">Loading…</div>;
  if (!job) return <div className="max-w-3xl mx-auto px-4 py-10 text-white/60">Job not found.</div>;

  const me = walletAddress?.toLowerCase();
  const isPoster = me === job.poster_address.toLowerCase();
  const isAwarded = me && job.awarded_worker_address && me === job.awarded_worker_address.toLowerCase();
  const myApp = applications.find(a => a.applicant_address.toLowerCase() === me);
  const myReview = reviews.find(r => r.reviewer_address.toLowerCase() === me);
  const isCompleted = job.status === 'completed';
  const canReview = isCompleted && (isPoster || submissions.some(s => s.worker_address.toLowerCase() === me && s.approval_status === 'approved'));

  const requireAuth = () => { if (!me) { openLoginModal(); return false; } return true; };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button onClick={() => navigate('/app/work')} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/80 inline-flex items-center gap-1">
            <Briefcase className="w-3 h-3" /> {job.job_type}
          </span>
          {job.platform && <span className="px-2 py-0.5 rounded-md bg-white/5 text-white/60 uppercase">{job.platform}</span>}
          <span className={`px-2 py-0.5 rounded-md ${
            job.status === 'open' ? 'bg-emerald-500/20 text-emerald-300' :
            job.status === 'disputed' ? 'bg-red-500/20 text-red-300' :
            job.status === 'completed' ? 'bg-blue-500/20 text-blue-200' :
            'bg-white/10 text-white/60'
          }`}>{job.status}</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{job.title}</h1>
        <p className="text-sm text-white/70 whitespace-pre-wrap mb-4">{job.description}</p>
        {job.target_url && (
          <a href={job.target_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white mb-4">
            <ExternalLink className="w-3 h-3" /> {job.target_url}
          </a>
        )}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
          <Stat label="Total" value={`${job.total_budget.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${job.currency}`} />
          {job.job_type !== 'contract' ? (
            <Stat label="Per unit" value={`${job.price_per_unit} ${job.currency}`} />
          ) : <Stat label="Type" value="Contract" />}
          <Stat label="Slots" value={`${job.units_approved}/${job.max_units}`} />
        </div>
        <div className="text-[11px] text-white/40 mt-3">
          Posted by <Link to={`/${job.poster_address}`} className="underline">{job.poster_address.slice(0, 6)}…{job.poster_address.slice(-4)}</Link>
        </div>
      </div>

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
              <div className="flex items-center justify-between mb-1">
                <Link to={`/${a.applicant_address}`} className="text-sm font-medium text-white hover:underline">
                  {a.applicant_address.slice(0, 6)}…{a.applicant_address.slice(-4)}
                </Link>
                <span className={`text-[11px] px-2 py-0.5 rounded-md ${a.status === 'awarded' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{a.status}</span>
              </div>
              <p className="text-sm text-white/70 whitespace-pre-wrap">{a.cover_letter}</p>
              {isPoster && a.status === 'pending' && job.status === 'open' && (
                <button
                  onClick={() => awardMutation.mutate({ job_id: job.id, application_id: a.id, worker_address: a.applicant_address })}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold"
                >
                  Award & escrow
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
            <div key={s.id} className="p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
              <div className="flex items-center justify-between mb-1">
                <Link to={`/${s.worker_address}`} className="text-sm font-medium text-white hover:underline">
                  {s.worker_address.slice(0, 6)}…{s.worker_address.slice(-4)}
                </Link>
                <span className={`text-[11px] px-2 py-0.5 rounded-md ${
                  s.approval_status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                  s.approval_status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                  'bg-white/10 text-white/60'
                }`}>{s.approval_status}</span>
              </div>
              <a href={s.proof_url} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-white inline-flex items-center gap-1 break-all">
                <ExternalLink className="w-3 h-3 flex-shrink-0" /> {s.proof_url}
              </a>
              {s.proof_text && <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{s.proof_text}</p>}
              {s.approval_status === 'approved' && s.payout_amount > 0 && (
                <div className="text-[11px] text-emerald-300 mt-1">Paid {s.payout_amount} {job.currency}</div>
              )}
              {isPoster && s.approval_status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => approveMutation.mutate({ submission_id: s.id, job_id: job.id, onchain_job_id: job.onchain_job_id, worker_address: s.worker_address, payout_amount: job.job_type === 'contract' ? job.total_budget : job.price_per_unit })}

                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Approve & release
                  </button>
                  <button
                    onClick={() => {
                      const reason = window.prompt('Reason for rejection?') || '';
                      if (reason) rejectMutation.mutate({ submission_id: s.id, job_id: job.id, reason });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
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
            <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={2} placeholder="Share your experience…" className={inputCls} />
            <button
              onClick={() => {
                const reviewee = isPoster
                  ? submissions.find(s => s.approval_status === 'approved')?.worker_address ?? job.awarded_worker_address
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
            <div className="flex items-center justify-between">
              <Link to={`/${r.reviewer_address}`} className="text-sm font-medium text-white hover:underline">
                {r.reviewer_address.slice(0, 6)}…{r.reviewer_address.slice(-4)}
              </Link>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-white/20'}`} />
                ))}
              </div>
            </div>
            {r.comment && <p className="text-sm text-white/70 mt-1">{r.comment}</p>}
          </div>
        ))}
      </Section>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {isPoster && job.status === 'in_progress' && (
          <button onClick={() => completeMutation.mutate(job.id)} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold">
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
          <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} rows={3} placeholder="Explain the issue…" className={inputCls} />
          <button
            disabled={!disputeReason.trim()}
            onClick={() => { disputeMutation.mutate({ job_id: job.id, reason: disputeReason.trim() }); setShowDispute(false); setDisputeReason(''); }}
            className="px-4 py-2 rounded-xl bg-red-500/30 text-red-100 text-sm font-semibold"
          >
            Submit dispute to admin
          </button>
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
