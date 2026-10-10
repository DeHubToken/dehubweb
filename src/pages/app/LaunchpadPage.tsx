import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getLaunchpadBase } from '@/lib/launchpad/base-path';
import { SEOHead } from '@/components/SEOHead';
import { Plus, Rocket, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLaunchpadTokens, type LaunchpadFilter } from '@/hooks/use-launchpad-tokens';
import { CoinCard } from '@/components/app/launchpad/CoinCard';
import { LiveActivityTicker } from '@/components/app/launchpad/LiveActivityTicker';
import { TrendingBar } from '@/components/app/launchpad/TrendingBar';
import { IslandAction, PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';

const FILTERS: { id: LaunchpadFilter; labelKey: string }[] = [
  { id: 'new', labelKey: 'launchpad.filterNew' },
  { id: 'graduating', labelKey: 'launchpad.filterGraduating' },
  { id: 'trending', labelKey: 'launchpad.filterTrending' },
  { id: 'graduated', labelKey: 'launchpad.filterGraduated' },
  { id: 'mine', labelKey: 'launchpad.filterMine' },
];

export default function LaunchpadPage() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth() as { walletAddress?: string };
  const [filter, setFilter] = useState<LaunchpadFilter>('new');
  const [search, setSearch] = useSurfaceDraft("pages/app/LaunchpadPage.tsx:search", '');
  const location = useLocation();
  const navigate = useNavigate();
  const base = getLaunchpadBase(location.pathname);
  const { data: tokens = [], isLoading, isError, refetch } = useLaunchpadTokens(filter, walletAddress);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.creator_address.toLowerCase().includes(q)
    );
  }, [tokens, search]);

  return (
    <div className="min-h-screen">
      {/* SEOHead writes the head imperatively — the raw Helmet this replaces
          rendered nothing, so the noindex never actually reached the DOM. */}
      <SEOHead
        title={t('launchpad.seoTitle')}
        description={t('launchpad.seoDescription')}
        url="https://dehub.io/launchpad"
        image="https://dehub.io/og/launchpad.jpg"
        noindex
      />

      <PageIsland
        className="max-w-7xl mx-auto"
        icon={<Rocket className="h-6 w-6 text-white" />}
        title={t('launchpad.srHeading')}
        subtitle={t('launchpad.phaseBadge')}
        actions={
          <IslandAction label={t('launchpad.createCoin')} onClick={() => navigate(`${base}/create`)}>
            <Plus className="h-[18px] w-[18px]" />
          </IslandAction>
        }
        tabs={
          <PageTabs
            value={filter}
            onChange={setFilter}
            tabs={FILTERS.map((f) => ({ id: f.id, label: t(f.labelKey) }))}
          />
        }
      >
        <div className="relative md:w-72">
          <Search className="h-4 w-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('launchpad.searchPlaceholder')}
            className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30" />
        </div>
      </PageIsland>

      <PageBody className="max-w-7xl mx-auto">
      {/* Hero */}
      <div data-kit-section className="bg-black/60 backdrop-blur-[24px] border border-white/10 p-5 md:p-7 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-white text-2xl md:text-3xl font-bold">{t('launchpad.heroTitle')}</h2>
          <p className="text-white/60 text-sm mt-1">{t('launchpad.heroSubtitle')}</p>
        </div>
        <Link to={`${base}/create`} data-kit-button="primary" className="self-start md:self-auto">
          {t('launchpad.createCoin')}
        </Link>
      </div>

      {/* Trending bar */}
      <div data-kit-section>
        <TrendingBar />
      </div>

      {/* Grid + ticker */}
      <div data-kit-section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div>
          {isLoading
            ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-40 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
                ))}
              </div>
            : isError
              ? <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-10 text-center text-white/60">
                  {t('launchpad.loadFailed')} <button onClick={() => refetch()} className="text-white underline">{t('launchpad.retry')}</button>
                </div>
              : filtered.length === 0
                ? <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-10 text-center text-white/60">
                    {t('launchpad.noCoins')} <Link to={`${base}/create`} className="text-white underline">{t('launchpad.beTheFirst')}</Link>
                  </div>
                : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtered.map(t => <CoinCard key={t.id} token={t} />)}
                  </div>}
        </div>
        <LiveActivityTicker />
      </div>
      </PageBody>
      <Outlet />
    </div>
  );
}
