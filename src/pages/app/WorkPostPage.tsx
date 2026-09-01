import { useState } from 'react';
import { useFormDraft } from '@/hooks/use-form-draft';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useCreateJob } from '@/features/work/hooks/use-work';
import { bountyPath } from '@/features/work/seo';
import type { WorkJobType, WorkCurrency, WorkPlatform } from '@/features/work/types';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';

const TYPE_OPTIONS: Array<{ id: WorkJobType; labelKey: string; descKey: string; icon: ThemeIconKey; unitKey: string }> = [
  { id: 'shill', labelKey: 'work.typeShill', descKey: 'work.typeShillDesc', icon: 'messages', unitKey: 'work.unitComment' },
  { id: 'clipping', labelKey: 'work.typeClipping', descKey: 'work.typeClippingDesc', icon: 'videos', unitKey: 'work.unitViews' },
  { id: 'contract', labelKey: 'work.typeContract', descKey: 'work.typeContractDesc', icon: 'command', unitKey: 'work.unitJob' },
];

const PLATFORMS: WorkPlatform[] = ['x', 'youtube', 'instagram', 'tiktok', 'facebook', 'reddit', 'other'];

export default function WorkPostPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  /*
   * /work/post is a plain lazy route, not a cached page, so it unmounts the
   * moment the user goes to copy the link they are being asked for — and came
   * back to an empty three-step form. `step` rides along so they land back on
   * the part they had reached.
   */
  const draft = useFormDraft(
    'work-post',
    { step, jobType, title, description, platform, targetUrl, currency, pricePerUnit, maxUnits, deadline },
    (saved) => {
      if (saved.step) setStep(saved.step);
      if (saved.jobType) setJobType(saved.jobType);
      if (saved.title) setTitle(saved.title);
      if (saved.description) setDescription(saved.description);
      if (saved.platform) setPlatform(saved.platform);
      if (saved.targetUrl) setTargetUrl(saved.targetUrl);
      if (saved.currency) setCurrency(saved.currency);
      if (saved.pricePerUnit) setPricePerUnit(saved.pricePerUnit);
      if (saved.maxUnits) setMaxUnits(saved.maxUnits);
      if (saved.deadline) setDeadline(saved.deadline);
    },
  );

  const priceNum = Number(pricePerUnit) || 0;
  const unitsNum = jobType === 'contract' ? 1 : Number(maxUnits) || 0;
  const total = priceNum * unitsNum;
  const unitLabel = t(TYPE_OPTIONS.find((opt) => opt.id === jobType)!.unitKey);

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
      // The bounty exists now; the draft of it must not outlive it and reappear
      // pre-filled the next time someone opens this page.
      draft.clear();
      navigate(bountyPath(job));
    } catch { /* toast already shown */ }
  };

  return (
    <div data-work-surface className="max-w-2xl mx-auto px-4 py-6">
      <SEOHead title="Post a Bounty — DeHub Bounties" description="Post a bounty on DeHub: social media tasks, clipping bounties, or fixed-price contracts paid in DHB or USDC." url="https://dehub.io/work/post" />
      <button
        onClick={() => navigate('/work')}
        className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t('work.backToBounties')}
      </button>

      <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <ThemedIcon icon="bounties" alt="" className="w-12 h-12 shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-bold text-white">{t('work.postBounty')}</h1>
            <p className="text-sm text-white/60">{t('work.stepOf', { step })}</p>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            {TYPE_OPTIONS.map((opt) => {
              const active = jobType === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setJobType(opt.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    active ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                      <ThemedIcon icon={opt.icon} alt="" className="w-8 h-8 object-contain" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{t(opt.labelKey)}</div>
                      <div className="text-xs text-white/60">{t(opt.descKey)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              onClick={() => setStep(2)}
              className="w-full mt-4 px-4 py-3 rounded-2xl bg-white text-black font-semibold"
            >
              {t('work.continue')}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label={t('work.fieldTitle')}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('work.titlePlaceholder')} className={inputCls} />
            </Field>
            <Field label={t('work.fieldDescription')}>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder={t('work.descriptionPlaceholder')} className={inputCls} />
            </Field>
            {jobType !== 'contract' && (
              <>
                <Field label={t('work.fieldPlatform')}>
                  <select value={platform} onChange={(e) => setPlatform(e.target.value as WorkPlatform)} className={inputCls}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </Field>
                <Field label={jobType === 'clipping' ? t('work.fieldTargetUrlClip') : t('work.fieldTargetUrl')}>
                  <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder={t('work.urlPlaceholder')} className={inputCls} />
                </Field>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white">{t('work.back')}</button>
              <button
                onClick={() => setStep(3)}
                disabled={!title.trim() || !description.trim()}
                className="flex-1 px-4 py-3 rounded-2xl bg-white text-black font-semibold disabled:opacity-40"
              >
                {t('work.continue')}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Field label={t('work.fieldCurrency')}>
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
            <Field label={jobType === 'contract' ? t('work.fieldTotalBudget') : t('work.pricePerUnit', { unit: unitLabel })}>
              <input type="number" min="0" step="0.01" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder={t('work.amountPlaceholder')} className={inputCls} />
            </Field>
            {jobType !== 'contract' && (
              <Field label={t('work.maxUnits', { unit: unitLabel })}>
                <input type="number" min="1" step="1" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} placeholder={t('work.maxUnitsPlaceholder')} className={inputCls} />
              </Field>
            )}
            <Field label={t('work.fieldDeadline')}>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </Field>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between text-sm text-white/70 mb-1">
                <span>{t('work.totalToEscrow')}</span>
                <span className="text-white font-semibold tabular-nums">{total.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}</span>
              </div>
              <div className="text-xs text-white/50">{t('work.platformFeeNote')}</div>
              <div className="text-[11px] text-amber-200/80 mt-2">
                {t('work.escrowSoonNote')}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white">{t('work.back')}</button>
              <button
                onClick={handleSubmit}
                disabled={createJob.isPending || total <= 0}
                className="flex-1 px-4 py-3 rounded-2xl bg-white text-black font-semibold disabled:opacity-40"
              >
                {createJob.isPending ? t('work.posting') : t('work.postJob')}
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
