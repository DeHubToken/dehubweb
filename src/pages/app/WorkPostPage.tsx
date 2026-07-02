import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Scissors, Briefcase } from 'lucide-react';
import { useCreateJob } from '@/features/work/hooks/use-work';
import type { WorkJobType, WorkCurrency, WorkPlatform } from '@/features/work/types';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';

const TYPE_OPTIONS: Array<{ id: WorkJobType; label: string; desc: string; icon: any; unitLabel: string }> = [
  { id: 'shill', label: 'Comments / Shill', desc: 'Pay per verified comment on X, YouTube, IG, TikTok.', icon: MessageSquare, unitLabel: 'comment' },
  { id: 'clipping', label: 'Clipping', desc: 'Pay per 1k views on clips posted across TikTok, IG, YouTube.', icon: Scissors, unitLabel: '1k views' },
  { id: 'contract', label: 'Contract', desc: 'Fixed-price gig. Pick one worker from applicants.', icon: Briefcase, unitLabel: 'job' },
];

const PLATFORMS: WorkPlatform[] = ['x', 'youtube', 'instagram', 'tiktok', 'facebook', 'reddit', 'other'];

export default function WorkPostPage() {
  const navigate = useNavigate();
  const { walletAddress, openLoginModal } = useAuth();
  const createJob = useCreateJob();
  const [step, setStep] = useState(1);

  const [jobType, setJobType] = useState<WorkJobType>('shill');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<WorkPlatform>('x');
  const [targetUrl, setTargetUrl] = useState('');
  const [currency, setCurrency] = useState<WorkCurrency>('DHB');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [maxUnits, setMaxUnits] = useState('');
  const [deadline, setDeadline] = useState('');

  const priceNum = Number(pricePerUnit) || 0;
  const unitsNum = jobType === 'contract' ? 1 : Number(maxUnits) || 0;
  const total = priceNum * unitsNum;
  const unitLabel = TYPE_OPTIONS.find((t) => t.id === jobType)!.unitLabel;

  const handleSubmit = async () => {
    if (!walletAddress) { openLoginModal(); return; }
    try {
      const job = await createJob.mutateAsync({
        job_type: jobType,
        title: title.trim(),
        description: description.trim(),
        platform: jobType !== 'contract' ? platform : undefined,
        target_url: targetUrl.trim() || undefined,
        currency,
        price_per_unit: priceNum,
        max_units: jobType === 'contract' ? 1 : unitsNum,
        deadline: deadline || undefined,
      });
      navigate(`/work/${job.id}`);
    } catch { /* toast already shown */ }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate('/work')}
        className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Work
      </button>

      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6">
        <h1 className="text-xl font-bold text-white mb-1">Post a Job</h1>
        <p className="text-sm text-white/60 mb-6">Step {step} of 3</p>

        {step === 1 && (
          <div className="space-y-3">
            {TYPE_OPTIONS.map((t) => {
              const Icon = t.icon;
              const active = jobType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setJobType(t.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    active ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{t.label}</div>
                      <div className="text-xs text-white/60">{t.desc}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              onClick={() => setStep(2)}
              className="w-full mt-4 px-4 py-3 rounded-2xl bg-white text-black font-semibold"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" className={inputCls} />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Be specific. Include hashtags, talking points, links to assets, etc." className={inputCls} />
            </Field>
            {jobType !== 'contract' && (
              <>
                <Field label="Platform">
                  <select value={platform} onChange={(e) => setPlatform(e.target.value as WorkPlatform)} className={inputCls}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </Field>
                <Field label={jobType === 'clipping' ? 'Original content URL (clip from)' : 'Target post / channel URL'}>
                  <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" className={inputCls} />
                </Field>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white">Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!title.trim() || !description.trim()}
                className="flex-1 px-4 py-3 rounded-2xl bg-white text-black font-semibold disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
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
            <Field label={jobType === 'contract' ? 'Total budget' : `Price per ${unitLabel}`}>
              <input type="number" min="0" step="0.01" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="0.00" className={inputCls} />
            </Field>
            {jobType !== 'contract' && (
              <Field label={`Max ${unitLabel}s`}>
                <input type="number" min="1" step="1" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} placeholder="100" className={inputCls} />
              </Field>
            )}
            <Field label="Deadline (optional)">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </Field>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between text-sm text-white/70 mb-1">
                <span>Total to escrow</span>
                <span className="text-white font-semibold tabular-nums">{total.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}</span>
              </div>
              <div className="text-xs text-white/50">+5% platform fee taken on each released payout.</div>
              <div className="text-[11px] text-amber-200/80 mt-2">
                Escrow contract launching soon. Until then, jobs run on a trust-based ledger — fund manually via your wallet on payout.
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white">Back</button>
              <button
                onClick={handleSubmit}
                disabled={createJob.isPending || total <= 0}
                className="flex-1 px-4 py-3 rounded-2xl bg-white text-black font-semibold disabled:opacity-40"
              >
                {createJob.isPending ? 'Posting…' : 'Post Job'}
              </button>
            </div>
          </div>
        )}
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
