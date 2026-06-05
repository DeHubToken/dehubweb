import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { getLaunchpadBase } from '@/lib/launchpad/base-path';
import { Helmet } from 'react-helmet-async';
import { Rocket, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLaunchpadTokens, type LaunchpadFilter } from '@/hooks/use-launchpad-tokens';
import { CoinCard } from '@/components/app/launchpad/CoinCard';
import { LiveActivityTicker } from '@/components/app/launchpad/LiveActivityTicker';
import { TrendingBar } from '@/components/app/launchpad/TrendingBar';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

const FILTERS: { id: LaunchpadFilter; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'graduating', label: 'About to graduate' },
  { id: 'trending', label: 'Trending' },
  { id: 'graduated', label: 'Graduated' },
  { id: 'mine', label: 'Mine' },
];

export default function LaunchpadPage() {
  const { walletAddress } = useAuth() as { walletAddress?: string };
  const [filter, setFilter] = useState<LaunchpadFilter>('new');
  const [search, setSearch] = useState('');
  const location = useLocation();
  const base = getLaunchpadBase(location.pathname);
  const { data: tokens = [], isLoading } = useLaunchpadTokens(filter, walletAddress);

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
      <Helmet>
        <title>Launchpad — DeHub</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">DeHub Launchpad</h1>

      {/* Hero */}
      <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-5 md:p-7 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wide">
            <Rocket className="h-3.5 w-3.5" /> Phase 1 · Private preview
          </div>
          <h2 className="text-white text-2xl md:text-3xl font-bold mt-1">TOKENISE BUSINESS</h2>
          <p className="text-white/60 text-sm mt-1">DHB-paired bonding curve. Graduates to Uniswap at $42K market cap.</p>
        </div>
        <Link to={`${base}/create`}>
          <LiquidGlassBubble shimmer className="inline-block [&>div]:!rounded-2xl [&>div]:!px-5 [&>div]:!py-3">
            <span className="text-white font-semibold text-sm">Create coin</span>
          </LiquidGlassBubble>
        </Link>
      </div>

      {/* Filters + search */}
      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className="shrink-0">
              <LiquidGlassBubble
                shimmer={false}
                noBorder={filter !== f.id}
                className={`[&>div]:!rounded-xl [&>div]:!px-3 [&>div]:!py-1.5 transition-all ${
                  filter === f.id
                    ? '[&>div]:!bg-white [&>div]:!text-black [&>div]:!font-semibold [&>div]:!shadow-none [&>div]:!border-transparent'
                    : '[&>div]:!text-white/70 [&>div]:!bg-gradient-to-br [&>div]:!from-white/[0.04] [&>div]:!via-white/[0.02] [&>div]:!to-transparent'
                }`}
              >
                <span className="text-sm whitespace-nowrap">{f.label}</span>
              </LiquidGlassBubble>
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="h-4 w-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ticker, name, creator"
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
            ? <div className="text-white/50 text-sm">Loading…</div>
            : filtered.length === 0
              ? <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-10 text-center text-white/60">
                  No coins yet. <Link to={`${base}/create`} className="text-white underline">Be the first.</Link>
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
