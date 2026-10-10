import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { tokenLabel } from '@/lib/token-label';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { useBrowseJobs, useRecentCompletedJobs } from '@/features/work/hooks/use-work';
import { JobCard } from '@/features/work/components/JobCard';
import type { WorkJobType, WorkCurrency } from '@/features/work/types';
import { SEOHead } from '@/components/SEOHead';
import { IslandAction, KitButton, PageBody, PageEmpty, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';


const TABS: Array<{ id: WorkJobType | 'all'; labelKey: string; icon: ThemeIconKey }> = [
  { id: 'all', labelKey: 'work.tabAll', icon: 'bounties' },
  { id: 'shill', labelKey: 'work.typeShillShort', icon: 'messages' },
  { id: 'clipping', labelKey: 'work.tabClipping', icon: 'videos' },
  { id: 'contract', labelKey: 'work.tabContracts', icon: 'command' },
];

export default function WorkPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<WorkJobType | 'all'>('all');
  const [currency, setCurrency] = useState<WorkCurrency | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'highest_pay' | 'ending_soon'>('newest');
  const [search, setSearch] = useSurfaceDraft("pages/app/WorkPage.tsx:search", '');

  const { data: jobs = [], isLoading } = useBrowseJobs({
    job_type: tab,
    currency,
    sort,
    search: search.trim() || undefined,
  });

  // An empty board is the common early state. If a filter caused it, say so and
  // offer to clear it; if nothing is open at all, fall back to recently
  // completed bounties so the page still shows what a bounty looks like.
  const hasFilters = tab !== 'all' || currency !== 'all' || search.trim().length > 0;
  const showCompletedFallback = !isLoading && jobs.length === 0 && !hasFilters;
  const { data: completedJobs = [] } = useRecentCompletedJobs(showCompletedFallback);
  const clearFilters = () => { setTab('all'); setCurrency('all'); setSearch.complete(search, ''); };

  return (
    <div data-work-surface className="min-h-screen">
      <SEOHead title="Bounties — Post & Hunt Paid Tasks | DeHub" description="Browse open bounties on DeHub: social media tasks, clipping bounties and fixed-price contracts. Claim a bounty as a hunter and get paid in tokens or USDC." url="https://dehub.io/work" />
      <PageIsland
        className="max-w-6xl mx-auto"
        icon="bounties"
        title={t('work.title')}
        subtitle={t('work.subtitle')}
        actions={
          <>
            <IslandAction label={t('work.myBounties')} onClick={() => navigate('/work/history')}>
              <History className="h-[18px] w-[18px]" />
            </IslandAction>
            <IslandAction label={t('work.postBounty')} onClick={() => navigate('/work/post')}>
              <ThemedIcon icon="bounties" alt="" className="h-[18px] w-[18px] object-contain" />
            </IslandAction>
          </>
        }
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={TABS.map((tabItem) => ({ id: tabItem.id, label: t(tabItem.labelKey), icon: tabItem.icon }))}
          />
        }
      >
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <ThemedIcon icon="search" alt="" className="w-5 h-5 absolute left-2.5 top-1/2 -translate-y-1/2 object-contain opacity-60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('work.searchPlaceholder')}
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
            />
          </div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as WorkCurrency | 'all')}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
          >
            <option value="all">{t('work.allCurrencies')}</option>
            <option value="DHB">{tokenLabel()}</option>
            <option value="USDC">USDC</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
          >
            <option value="newest">{t('work.sortNewest')}</option>
            <option value="highest_pay">{t('work.sortHighestPay')}</option>
            <option value="ending_soon">{t('work.sortEndingSoon')}</option>
          </select>
        </div>
      </PageIsland>

      {/* List */}
      <PageBody className="max-w-6xl mx-auto">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div>
            <PageEmpty
              icon="bounties"
              title={hasFilters ? t('work.emptyFiltered') : t('work.emptyNone')}
              action={
                <div className="flex items-center justify-center gap-3">
                  <KitButton variant="primary" onClick={() => navigate('/work/post')}>
                    <ThemedIcon icon="bounties" alt="" className="w-5 h-5 object-contain" />
                    {t('work.postBounty')}
                  </KitButton>
                  {hasFilters && (
                    <KitButton variant="quiet" onClick={clearFilters}>
                      {t('work.clearFilters')}
                    </KitButton>
                  )}
                </div>
              }
            />

            {showCompletedFallback && completedJobs.length > 0 && (
              <div>
                <h2 className="text-white font-semibold text-sm mb-3 px-1">{t('work.recentlyCompleted')}</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {completedJobs.map((j) => <JobCard key={j.id} job={j} />)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {jobs.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        )}
      </PageBody>
    </div>
  );
}
