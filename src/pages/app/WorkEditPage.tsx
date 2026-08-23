import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { useWorkJob, useUpdateJob, isJobEditable, isBudgetEditable } from '@/features/work/hooks/use-work';
import type { WorkJob, WorkCurrency, WorkJobType, WorkPlatform } from '@/features/work/types';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

const PLATFORMS: WorkPlatform[] = ['x', 'youtube', 'instagram', 'tiktok', 'facebook', 'reddit', 'other'];

const UNIT_LABELS: Record<WorkJobType, string> = {
  shill: 'comment',
  clipping: '1k views',
  contract: 'job',
};

const TYPE_LABELS: Record<WorkJobType, string> = {
  shill: 'Comments / Shill',
  clipping: 'Clipping',
  contract: 'Contract',
};

/** Why the money fields are frozen, in the order the poster would hit them. */
function budgetLockReason(job: WorkJob): string {
  if (job.fund_tx_hash) return 'Escrow is already funded on-chain, so the terms are locked.';
  if (job.application_count > 0 || job.submission_count > 0) {
    return 'People have already applied or submitted work, so the terms are locked.';
  }
  return 'This bounty is already under way, so the terms are locked.';
}

export default function WorkEditPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { walletAddress, isLoading: authLoading, openLoginModal } = useAuth();
  const { data: job, isLoading } = useWorkJob(jobId);
  const updateJob = useUpdateJob();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<WorkPlatform>('x');
  const [targetUrl, setTargetUrl] = useState('');
  const [currency, setCurrency] = useState<WorkCurrency>('DHB');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [maxUnits, setMaxUnits] = useState('');
  const [deadline, setDeadline] = useState('');
  // The fetched row seeds the form once. Re-running on every job change would
  // stomp what the poster is typing when the query refetches behind them.
  const [seededId, setSeededId] = useState<string | null>(null);

  useEffect(() => {
    if (!job || seededId === job.id) return;
    setTitle(job.title);
    setDescription(job.description);
    setPlatform(job.platform ?? 'x');
    setTargetUrl(job.target_url ?? '');
    setCurrency(job.currency);
    // Numerics come back padded to 18 decimals — trim them so the inputs read
    // like what was typed in the first place.
    setPricePerUnit(String(Number(job.price_per_unit) || 0));
    setMaxUnits(String(Number(job.max_units) || 1));
    setDeadline(job.deadline ? job.deadline.slice(0, 10) : '');
    setSeededId(job.id);
  }, [job, seededId]);

  if (isLoading || authLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-white/60">Loading…</div>;
  }
  if (!job) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-white/60">
        <ThemedIcon icon="bounties" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-75" />
        Bounty not found.
      </div>
    );
  }

  const isPoster = !!walletAddress && walletAddress.toLowerCase() === job.poster_address.toLowerCase();
  if (!isPoster || !isJobEditable(job)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-white/60 mb-4">
          {!walletAddress
            ? 'Sign in to edit a bounty you posted.'
            : !isPoster
              ? 'Only the poster can edit this bounty.'
              : `A ${job.status} bounty can no longer be edited.`}
        </p>
        <div className="flex gap-2">
          {!walletAddress && (
            <button onClick={() => openLoginModal()} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold">
              Sign in
            </button>
          )}
          <button
            onClick={() => navigate(`/work/${job.id}`)}
            className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm"
          >
            Back to bounty
          </button>
        </div>
      </div>
    );
  }

  const budgetEditable = isBudgetEditable(job);
  const unitLabel = UNIT_LABELS[job.job_type];
  const priceNum = Number(pricePerUnit) || 0;
  const unitsNum = job.job_type === 'contract' ? 1 : Number(maxUnits) || 0;
  const total = priceNum * unitsNum;
  const canSave =
    !!title.trim() &&
    !!description.trim() &&
    !updateJob.isPending &&
    (!budgetEditable || total > 0);

  const handleSave = async () => {
    try {
      await updateJob.mutateAsync({
        id: job.id,
        title: title.trim(),
        description: description.trim(),
        platform: job.job_type !== 'contract' ? platform : null,
        target_url: job.job_type !== 'contract' ? targetUrl.trim() : null,
        deadline: deadline || null,
        budget: budgetEditable
          ? {
              currency,
              price_per_unit: priceNum,
              max_units: job.job_type === 'contract' ? 1 : unitsNum,
            }
          : undefined,
      });
      navigate(`/work/${job.id}`);
    } catch { /* toast already shown */ }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <SEOHead
        title={`Edit ${job.title} — DeHub Bounties`}
        description="Edit a bounty you posted on DeHub."
        url={`https://dehub.io/work/${job.id}/edit`}
      />
      <button
        onClick={() => navigate(`/work/${job.id}`)}
        className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to bounty
      </button>

      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6">
        <h1 className="text-xl font-bold text-white mb-1">Edit Bounty</h1>
        <p className="text-sm text-white/60 mb-6">
          {TYPE_LABELS[job.job_type]} · the bounty type can’t be changed after posting.
        </p>

        <div className="space-y-4">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Be specific. Include hashtags, talking points, links to assets, etc." className={inputCls} />
          </Field>

          {job.job_type !== 'contract' && (
            <>
              <Field label="Platform">
                <select value={platform} onChange={(e) => setPlatform(e.target.value as WorkPlatform)} className={inputCls}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label={job.job_type === 'clipping' ? 'Original content URL (clip from)' : 'Target post / channel URL'}>
                <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" className={inputCls} />
              </Field>
            </>
          )}

          {budgetEditable ? (
            <>
              <Field label="Currency">
                <div className="flex gap-2">
                  {(['DHB', 'USDC'] as WorkCurrency[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium ${currency === c ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={job.job_type === 'contract' ? 'Total budget' : `Price per ${unitLabel}`}>
                <input type="number" min="0" step="0.01" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="0.00" className={inputCls} />
              </Field>
              {job.job_type !== 'contract' && (
                <Field label={`Max ${unitLabel}s`}>
                  <input type="number" min="1" step="1" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} placeholder="100" className={inputCls} />
                </Field>
              )}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between text-sm text-white/70">
                  <span>Total to escrow</span>
                  <span className="text-white font-semibold tabular-nums">
                    {total.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between text-sm text-white/70 mb-1">
                <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Total</span>
                <span className="text-white font-semibold tabular-nums">
                  {job.total_budget.toLocaleString(undefined, { maximumFractionDigits: 4 })} {job.currency}
                </span>
              </div>
              <div className="text-xs text-white/50">{budgetLockReason(job)}</div>
            </div>
          )}

          <Field label="Deadline (optional)">
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
          </Field>

          <div className="flex gap-2 pt-1">
            <button onClick={() => navigate(`/work/${job.id}`)} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 px-4 py-3 rounded-2xl bg-white text-black font-semibold disabled:opacity-40"
            >
              {updateJob.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-white/60 mb-1.5">{label}</div>
      {children}
    </label>
  );
}
