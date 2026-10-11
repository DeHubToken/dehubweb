/**
 * Revenue & costs, parked
 * =======================
 * The money half of the Stats page lives here, at /stats/money, until its
 * figures have been checked and it joins /stats. Nothing links to it and it
 * is noindex, so it is reachable only by its address.
 *
 * Same ranges as /stats, so the section moves back there unchanged.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { FinanceSection } from '@/components/app/stats/FinanceSection';
import { translateCopy } from '@/i18n/copy';

type Range = '24h' | '3d' | '7d' | '30d' | '1y' | 'all';

/** The labels /stats already translates. */
const RANGES: { key: Range; label: () => string }[] = [
  { key: '24h', label: () => translateCopy('copy.f0514e8df841', { defaultValue: '24 hours' }) },
  { key: '3d', label: () => translateCopy('copy.360719440e92', { defaultValue: '3 days' }) },
  { key: '7d', label: () => translateCopy('copy.7f920bb639c9', { defaultValue: '7 days' }) },
  { key: '30d', label: () => translateCopy('copy.ffd7280513ce', { defaultValue: '30 days' }) },
  { key: '1y', label: () => translateCopy('copy.91647badc37b', { defaultValue: '1 year' }) },
  { key: 'all', label: () => translateCopy('copy.9755c8d7d44a', { defaultValue: 'All time' }) },
];

export default function MoneyStatsPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>('all');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('stats.money.title', 'Revenue & costs')}
        description={t('stats.ledger.subtitle', 'Every entry behind the revenue figure, with a link to check it')}
        url="https://dehub.io/stats/money"
        noindex
        noCanonical
      />
      <h1 className="sr-only">{t('stats.money.title', 'Revenue & costs')}</h1>

      <PageIsland
        icon="stats"
        title={t('stats.money.title', 'Revenue & costs')}
        subtitle={t('stats.subtitle', 'Real-time open source intel')}
        tabs={
          <PageTabs
            value={range}
            onChange={setRange}
            tabs={RANGES.map((r) => ({ id: r.key, label: t(`stats.range.${r.key}`, r.label()) }))}
          />
        }
      />

      <PageBody>
        <FinanceSection range={range} />
      </PageBody>
    </div>
  );
}
