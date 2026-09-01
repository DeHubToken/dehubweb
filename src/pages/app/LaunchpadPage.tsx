import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { getLaunchpadBase } from '@/lib/launchpad/base-path';
import { SEOHead } from '@/components/SEOHead';
import { Rocket, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLaunchpadTokens, type LaunchpadFilter } from '@/hooks/use-launchpad-tokens';
import { CoinCard } from '@/components/app/launchpad/CoinCard';
import { LiveActivityTicker } from '@/components/app/launchpad/LiveActivityTicker';
import { TrendingBar } from '@/components/app/launchpad/TrendingBar';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';

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
  const [search, setSearch] = useState('');
  const location = useLocation();
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
    <div className="min-h-screen px-4 md:px-6 py-6 max-w-7xl mx-auto">
      {/* SEOHead writes the head imperatively — the raw Helmet this replaces
          rendered nothing, so the noindex never actually reached the DOM. */}
      <SEOHead
        title={t('launchpad.seoTitle')}
        description={t('launchpad.seoDescription')}
        url="https://dehub.io/launchpad"
        image="https://dehub.io/og/launchpad.jpg"
        noindex
      />
      <h1 className="sr-only">{t('launchpad.srHeading')}</h1>

      {/* Hero */}
      <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-5 md:p-7 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wide">
            <Rocket className="h-3.5 w-3.5" /> {t('launchpad.phaseBadge')}
          </div>
          <h2 className="text-white text-2xl md:text-3xl font-bold mt-1">{t('launchpad.heroTitle')}</h2>
          <p className="text-white/60 text-sm mt-1">{t('launchpad.heroSubtitle')}</p>
        </div>
        <Link to={`${base}/create`}>
          <LiquidGlassBubble shimmer className="inline-block [&>div]:!rounded-2xl [&>div]:!px-5 [&>div]:!py-3">
            <span className="text-white font-semibold text-sm">{t('launchpad.createCoin')}</span>
          </LiquidGlassBubble>
        </Link>
      </div>

      {/* Filters + search */}
      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {FILTERS.map(f => (
            <LiquidGlassBubble2
              key={f.id}
              label={t(f.labelKey)}
              active={filter === f.id}
              shimmer={false}
              onClick={() => setFilter(f.id)}
              width="auto"
              height="34px"
              className="[&>div]:!px-3 [&>div]:!py-1.5 transition-all"
            />
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="h-4 w-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('launchpad.searchPlaceholder')}
            className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30" />
        </div>
      </div>

      {/* Trending bar */}
      <div className="mt-4">
        <TrendingBar />
      </div>

      {/* Grid + ticker */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
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
      <Outlet />
    </div>
  );
}
