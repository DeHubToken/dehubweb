import { useTranslation } from 'react-i18next';
import type { LinkPreviewData } from '@/lib/api/link-preview';
import { formatPredictionProbability } from '@/lib/predictions';

/** Inside the ordinary source link, so sharing works everywhere links already do. */
export function PredictionDetails({ preview }: { preview: LinkPreviewData }) {
  const { t, i18n } = useTranslation();
  const data = preview.prediction;
  if (!data) return null;
  return (
    <div className="mt-3 space-y-3" data-prediction-provider={data.provider}>
      {data.markets.map((market, index) => (
        <div key={`${market.question}-${index}`} className="space-y-2">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-white/80">{market.question !== preview.title ? market.question : null}</span>
            <span className="shrink-0 text-white/60">{t(`support.status.${market.status}`)}</span>
          </div>
          {market.outcomes.map((outcome, outcomeIndex) => (
            <div key={`${outcome.label}-${outcomeIndex}`} className="relative overflow-hidden rounded-md bg-white/5 px-2.5 py-2">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${outcome.probability * 100}%` }} />
              <div className="relative flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 break-words text-white">{outcome.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-white">{formatPredictionProbability(outcome.probability, i18n.language)}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
      {data.totalMarkets > data.markets.length && <p className="text-xs text-white/60">+{data.totalMarkets - data.markets.length}</p>}
      <p className="text-[10px] text-white/60">
        {data.fetchedAt ? t('support.updatedAgo', { when: new Date(data.fetchedAt).toLocaleString(i18n.language) }) : t('common.failedToLoad')}
      </p>
    </div>
  );
}
