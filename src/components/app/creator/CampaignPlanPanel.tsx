import { useTranslation } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { CAMPAIGN_VARIANT_FIELDS, CAMPAIGN_VARIANT_LIMIT, EMPTY_CAMPAIGN_PLAN, campaignFieldLimit, campaignVariantDraft, normalizeCampaignPlan, type CampaignPlan, type CampaignVariant, type CampaignVariantField } from '@/lib/creator/campaignPlan';
import { MARKETING_FORMATS, type MarketingBrief } from '@/lib/creator/marketingBrief';
import type { GenerationDraft } from '@/lib/editor/generationDraft';

const labels: Record<CampaignVariantField, string> = { title: 'creator.campaignVariantTitle', hook: 'creator.campaignHook', language: 'creator.campaignLanguage', script: 'creator.campaignScript', headline: 'creator.marketing.fields.headline', cta: 'creator.marketing.fields.cta' };

export function CampaignPlanPanel({ brief, onPrepare }: { brief: MarketingBrief; onPrepare: (draft: GenerationDraft) => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useSurfaceDraft<CampaignPlan>('creator.campaignPlan.v1', EMPTY_CAMPAIGN_PLAN, 'campaign');
  const plan = normalizeCampaignPlan(saved);
  const update = (id: string, patch: Partial<CampaignVariant>) => setSaved({ ...plan, variants: plan.variants.map(item => item.id === id ? { ...item, ...patch } : item) });
  const button = 'rounded-xl border border-current px-3 py-2 text-sm disabled:opacity-40';
  const input = 'mt-1 w-full rounded-xl border border-white/20 bg-transparent p-3 text-sm';
  return <section className="mt-6 border-t border-white/15 pt-5" aria-label={t('creator.campaignPlanTitle')}>
    <h3 className="font-semibold">{t('creator.campaignPlanTitle')}</h3>
    <p className="mt-2 text-xs opacity-70">{t('creator.campaignPlanIntro')}</p>
    <label className="mt-4 block text-sm">{t('creator.campaignTitle')}<input className={input} value={plan.title} maxLength={180} onChange={event => setSaved({ ...plan, title: event.target.value })} /></label>
    <label className="mt-3 block text-sm">{t('creator.campaignContinuity')}<textarea className={input} value={plan.continuity} maxLength={500} rows={3} onChange={event => setSaved({ ...plan, continuity: event.target.value })} /></label>
    <div className="my-4 flex flex-wrap gap-3">
      <button type="button" className={button} disabled={plan.variants.length >= CAMPAIGN_VARIANT_LIMIT} onClick={() => setSaved({ ...plan, variants: [...plan.variants, { id: crypto.randomUUID(), format: 'square', title: '', hook: '', language: '', headline: '', cta: '', script: '' }] })}>{t('creator.campaignAdd')}</button>
      <button type="button" className="px-3 py-2 text-sm underline" onClick={() => { setSaved(EMPTY_CAMPAIGN_PLAN); setSaved.clear(); }}>{t('creator.campaignClear')}</button>
    </div>
    <ol className="grid gap-4 lg:grid-cols-2">
      {plan.variants.map((variant, index) => <li key={variant.id} className="min-w-0 rounded-2xl border border-white/15 p-4">
        <h4 className="mb-3 font-semibold">{index + 1}. {variant.title || t('creator.campaignVariantTitle')}</h4>
        <label className="block text-sm">{t('creator.campaignFormat')}<select className={input} value={variant.format} onChange={event => update(variant.id, { format: event.target.value as CampaignVariant['format'] })}>
          {MARKETING_FORMATS.map(format => <option key={format.id} value={format.id}>{t(`creator.marketing.formats.${format.id}`)} · {format.aspect}</option>)}
        </select></label>
        {CAMPAIGN_VARIANT_FIELDS.map(field => <label key={field} className="mt-3 block text-sm">{t(labels[field])}<textarea className={input} value={variant[field]} maxLength={campaignFieldLimit(field)} rows={field === 'script' ? 4 : 2} onChange={event => update(variant.id, { [field]: event.target.value })} /></label>)}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={!brief.product.trim() || !brief.description.trim()} onClick={() => { const draft = campaignVariantDraft(brief, plan, variant.id); if (draft) onPrepare(draft); }}>{t('creator.marketing.open')}</button>
          {[-1, 1].map(offset => <button key={offset} type="button" className={button} disabled={index + offset < 0 || index + offset >= plan.variants.length} onClick={() => { const variants = [...plan.variants]; [variants[index], variants[index + offset]] = [variants[index + offset], variants[index]]; setSaved({ ...plan, variants }); }}>{t(offset < 0 ? 'editor.film.earlier' : 'editor.film.later')}</button>)}
          <button type="button" className={button} onClick={() => setSaved({ ...plan, variants: plan.variants.filter(item => item.id !== variant.id) })}>{t('editor.film.remove')}</button>
        </div>
      </li>)}
    </ol>
  </section>;
}
