import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSubscriptionCredits } from '@/hooks/use-subscription-credits';
import { builderPricingApi, formatMicrosUsd } from '@/lib/builder/api';

const TopUpDialog = lazy(() => import('@/components/app/credits/SubscriptionCreditsTopUpDialog'));

/**
 * Which model @assistant builds with, what a prompt costs on it, and the
 * credit balance that pays for it. Builds are charged per prompt from the
 * USD credit balance; `?topup=1` (the link a short-balance reply carries)
 * opens the top-up straight away.
 */
export function BuilderModelPicker({ isLight }: { isLight: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [topUpOpen, setTopUpOpen] = useState(params.get('topup') === '1');
  const { data: credits } = useSubscriptionCredits();
  const { data: pricing } = useQuery({ queryKey: ['builder-pricing'], queryFn: builderPricingApi.pricing, staleTime: 60_000 });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (pricing && !selected) setSelected(pricing.model);
  }, [pricing, selected]);

  const choose = async (id: string) => {
    setSelected(id);
    await builderPricingApi.setModel(id).catch(() => setSelected(pricing?.model ?? null));
    queryClient.invalidateQueries({ queryKey: ['builder-pricing'] });
  };

  const closeTopUp = (open: boolean) => {
    setTopUpOpen(open);
    if (!open && params.has('topup')) {
      params.delete('topup');
      setParams(params, { replace: true });
    }
  };

  const dim = isLight ? 'text-[#5a5a5a]' : 'text-[#949499]';
  const ink = isLight ? 'text-[#1a1a1a]' : 'text-[#fff]';

  return (
    <div className={cn('mt-6 rounded-2xl border p-4 backdrop-blur-md', isLight ? 'border-[rgba(0,0,0,0.12)] bg-[rgba(255,255,255,0.7)]' : 'border-[rgba(255,255,255,0.09)] bg-[rgba(10,10,12,0.55)]')}>
      <div className="flex items-center justify-between gap-3">
        <span className={cn('text-[14px] font-semibold', ink)}>{t('builder.modelLabel')}</span>
        {credits && (
          <span className={cn('text-[13px] tabular-nums', dim)}>
            {t('builder.creditsLeft', { amount: credits.usd.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) })}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={t('builder.modelLabel')}>
        {(pricing?.models ?? []).map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected === m.id}
            onClick={() => choose(m.id)}
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              selected === m.id
                ? (isLight ? 'border-[#1a1a1a] bg-[rgba(0,0,0,0.05)]' : 'border-[#fff] bg-[rgba(255,255,255,0.08)]')
                : (isLight ? 'border-[rgba(0,0,0,0.12)]' : 'border-[rgba(255,255,255,0.09)]'),
            )}
          >
            <span className={cn('text-[14px]', ink)}>{m.label}</span>
            <span className={cn('text-[13px] tabular-nums', dim)}>{t('builder.perPrompt', { price: formatMicrosUsd(m.typicalMicros) })}</span>
          </button>
        ))}
      </div>
      <p className={cn('mt-3 text-[12px] leading-relaxed', dim)}>{t('builder.pricingNote')}</p>
      <Button type="button" variant="secondary" onClick={() => setTopUpOpen(true)} className="mt-3 w-full">
        {t('builder.topUpCredits')}
      </Button>
      <Suspense fallback={null}>
        {topUpOpen && <TopUpDialog open={topUpOpen} onOpenChange={closeTopUp} />}
      </Suspense>
    </div>
  );
}
