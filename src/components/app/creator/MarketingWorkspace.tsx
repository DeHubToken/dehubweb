import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import type { GenerationDraft } from '@/lib/editor/generationDraft';
import { EMPTY_MARKETING_BRIEF, MARKETING_FIELDS, MARKETING_FORMATS, marketingFieldLimit, marketingGenerationDraft, normalizeMarketingBrief, type MarketingBrief, type MarketingField } from '@/lib/creator/marketingBrief';
import { MarketingProductImport } from './MarketingProductImport';
import { CampaignPlanPanel } from './CampaignPlanPanel';

export function MarketingWorkspace({ onPrepare }: { onPrepare: (draft: GenerationDraft) => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useSurfaceDraft<MarketingBrief>('creator.marketingBrief.v1', EMPTY_MARKETING_BRIEF, 'campaign');
  const [preview, setPreview] = useState(false);
  const brief = normalizeMarketingBrief(saved);
  const ready = Boolean(brief.product.trim() && brief.description.trim());
  const update = (field: MarketingField, value: string) => { setSaved({ ...brief, [field]: value }); setPreview(false); };
  return (
    <section data-creator-marketing className="mx-3 my-6 scroll-mt-28 rounded-3xl border border-white/15 bg-white/[0.04] p-4 sm:mx-4 sm:p-6">
      <h2 className="text-xl font-bold">{t('creator.marketing.title')}</h2>
      <p className="mt-2 text-sm opacity-75">{t('creator.marketing.intro')}</p>
      <p className="mt-1 text-xs opacity-60">{t('creator.marketing.saved')}</p>
      <MarketingProductImport onUse={(product, sourceUrl) => { setSaved(normalizeMarketingBrief({ ...brief, product: product.name, description: product.description, brand: product.brand || brief.brand, sourceUrl })); setPreview(false); }} />
      {brief.sourceUrl && <p className="mt-3 break-all text-xs opacity-60">{t('creator.marketing.import.source')}: {brief.sourceUrl}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETING_FIELDS.map((field) => <label key={field} className={field === 'description' ? 'sm:col-span-2 lg:col-span-2' : ''}>
          <span className="mb-1.5 block text-sm font-medium">{t(`creator.marketing.fields.${field}`)}</span>
          <textarea value={brief[field]} rows={field === 'description' ? 3 : 2} maxLength={marketingFieldLimit(field)} required={field === 'product' || field === 'description'}
            onChange={(event) => update(field, event.target.value)} className="w-full resize-y rounded-xl border border-white/20 bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" />
        </label>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={!ready} onClick={() => setPreview(true)} className="rounded-xl border border-current px-4 py-2 text-sm font-semibold disabled:opacity-40">{t('creator.marketing.preview')}</button>
        <button type="button" onClick={() => { setSaved(EMPTY_MARKETING_BRIEF); setSaved.clear(); setPreview(false); }} className="rounded-xl px-3 py-2 text-sm underline">{t('creator.marketing.clear')}</button>
      </div>
      {!ready && <p className="mt-3 text-xs opacity-70">{t('creator.marketing.required')}</p>}
      {preview && ready && <div className="mt-5" aria-live="polite">
        <h3 className="font-semibold">{t('creator.marketing.variants')}</h3>
        <p className="mt-1 text-xs opacity-70">{t('creator.marketing.reviewHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETING_FORMATS.map((format) => <article key={format.id} className="min-w-0 rounded-2xl border border-white/15 p-4">
            <h4 className="font-semibold">{t(`creator.marketing.formats.${format.id}`)}</h4>
            <p className="text-xs opacity-60">{format.aspect}</p>
            <p className="mt-3 break-words text-sm font-medium">{brief.headline.trim() || brief.product.trim()}</p>
            {brief.benefit.trim() && <p className="mt-1 break-words text-xs opacity-75">{brief.benefit.trim()}</p>}
            {brief.cta.trim() && <p className="mt-2 break-words text-xs font-semibold">{brief.cta.trim()}</p>}
            <button type="button" onClick={() => { const draft = marketingGenerationDraft(brief, format.id); if (draft) onPrepare(draft); }} className="mt-4 rounded-xl border border-current px-3 py-2 text-sm">{t('creator.marketing.open')}</button>
          </article>)}
        </div>
      </div>}
      <CampaignPlanPanel brief={brief} onPrepare={onPrepare} />
    </section>
  );
}
