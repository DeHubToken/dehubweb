import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useCmcTop100, type CmcCoin } from '@/hooks/use-cmc-top-100';
import { useTopAssets, type TopAsset } from '@/hooks/use-top-assets';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';

const PAGE_SIZE = 100;

interface UnifiedAsset {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change1h: number | null;
  change24h: number;
  change7d: number | null;
  marketCap: number;
  volume24h: number;
  logoElement: React.ReactNode;
  navQuery: string;
}

function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(4)}`;
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function PercentBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded',
      isPositive ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
    )}>
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function GoldIcon() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, #FFD700, #B8860B)', color: '#fff' }}>
      Au
    </div>
  );
}

function SilverIcon() {
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, #C0C0C0, #808080)', color: '#fff' }}>
      Ag
    </div>
  );
}

function AssetLogo({ asset }: { asset: TopAsset }) {
  if (asset.symbol === 'GOLD') return <GoldIcon />;
  if (asset.symbol === 'SILVER') return <SilverIcon />;
  if (asset.logoUrl) {
    return <img src={asset.logoUrl} alt={asset.symbol} className="w-6 h-6 rounded-full bg-white" loading="lazy" />;
  }
  return <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-300 font-bold">{asset.symbol.slice(0, 2)}</div>;
}

function CoinLogo({ coin }: { coin: CmcCoin }) {
  return (
    <img
      src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
      alt={coin.symbol}
      className="w-6 h-6 rounded-full"
      loading="lazy"
    />
  );
}

function UnifiedRow({ asset, rank, onClick }: { asset: UnifiedAsset; rank: number; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">
      <td className="py-3 px-3 text-zinc-400 text-sm font-medium">{rank}</td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          {asset.logoElement}
          <span className="text-white font-medium text-sm">{asset.name}</span>
          <span className="text-zinc-500 text-xs">{asset.symbol}</span>
        </div>
      </td>
      <td className="py-3 px-3 text-white text-sm text-right font-mono">{formatPrice(asset.price)}</td>
      <td className="py-3 px-3 text-right hidden sm:table-cell">
        {asset.change1h != null ? <PercentBadge value={asset.change1h} /> : '—'}
      </td>
      <td className="py-3 px-3 text-right"><PercentBadge value={asset.change24h} /></td>
      <td className="py-3 px-3 text-right hidden md:table-cell">
        {asset.change7d != null ? <PercentBadge value={asset.change7d} /> : '—'}
      </td>
      <td className="py-3 px-3 text-right text-zinc-300 text-sm font-mono hidden lg:table-cell">{formatLargeNumber(asset.marketCap)}</td>
      <td className="py-3 px-3 text-right text-zinc-400 text-sm font-mono hidden xl:table-cell">{formatLargeNumber(asset.volume24h)}</td>
    </tr>
  );
}

export default function Top100CryptosPage() {
  const { data: coins, isLoading: cryptoLoading, error: cryptoError } = useCmcTop100();
  const { data: assets, isLoading: assetsLoading } = useTopAssets();
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const allAssets = useMemo(() => {
    const unified: UnifiedAsset[] = [];

    // Add traditional assets
    if (assets) {
      for (const a of assets) {
        if (a.price == null || a.marketCap == null) continue;
        unified.push({
          id: `asset-${a.symbol}`,
          name: a.name,
          symbol: a.symbol,
          price: a.price,
          change1h: null,
          change24h: a.change24h ?? 0,
          change7d: null,
          marketCap: a.marketCap,
          volume24h: a.volume24h ?? 0,
          logoElement: <AssetLogo asset={a} />,
          navQuery: `$${a.symbol}`,
        });
      }
    }

    // Add crypto
    if (coins) {
      for (const c of coins) {
        unified.push({
          id: `coin-${c.id}`,
          name: c.name,
          symbol: c.symbol,
          price: c.price,
          change1h: c.percent_change_1h,
          change24h: c.percent_change_24h,
          change7d: c.percent_change_7d,
          marketCap: c.market_cap,
          volume24h: c.volume_24h,
          logoElement: <CoinLogo coin={c} />,
          navQuery: `$${c.symbol}`,
        });
      }
    }

    unified.sort((a, b) => b.marketCap - a.marketCap);

    return unified;
  }, [assets, coins]);

  const hasMore = allAssets.length > visibleCount;
  const visibleAssets = allAssets.slice(0, visibleCount);

  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, allAssets.length));
    }
  }, [hasMore, allAssets.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const isLoading = cryptoLoading || assetsLoading;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <SEOHead title="Top Assets — Live Prices for Stocks, Commodities & Crypto" description="Track live prices for gold, silver, oil, Tesla, Apple, Bitcoin, stocks, commodities and thousands of crypto assets on DeHub." url="https://dehub.io/app/top-100" jsonLd={{ '@context': 'https://schema.org', '@type': 'Table', name: 'Top Assets', url: 'https://dehub.io/app/top-100', description: 'Live prices and market data for top stocks, commodities and cryptocurrencies.' }} />
      <h1 className="sr-only">DeHub Top Assets — Live Prices for Stocks, Commodities & Crypto</h1>

      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-white shrink-0">Top Assets</h2>
        {!isLoading && allAssets.length > 0 && (
          <span className="text-zinc-500 text-sm min-w-0 truncate">
            Showing {visibleAssets.length.toLocaleString()} of {allAssets.length.toLocaleString()}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      )}

      {cryptoError && (
        <div className="text-red-400 text-center py-10">Failed to load data. Please try again later.</div>
      )}

      {!isLoading && visibleAssets.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[760px] sm:min-w-0">
            <thead>
              <tr className="border-b border-white/10 text-zinc-500 text-xs uppercase">
                <th className="py-3 px-3 text-left">#</th>
                <th className="py-3 px-3 text-left">Name</th>
                <th className="py-3 px-3 text-right">Price</th>
                <th className="py-3 px-3 text-right hidden sm:table-cell">1h</th>
                <th className="py-3 px-3 text-right">24h</th>
                <th className="py-3 px-3 text-right hidden md:table-cell">7d</th>
                <th className="py-3 px-3 text-right">Market Cap</th>
                <th className="py-3 px-3 text-right hidden xl:table-cell">Volume (24h)</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((asset, i) => (
                <UnifiedRow
                  key={asset.id}
                  asset={asset}
                  rank={i + 1}
                  onClick={() => navigate(`/app/explore?q=${asset.navQuery}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div ref={sentinelRef} className="py-4 flex justify-center">
        {hasMore && <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />}
      </div>
    </div>
  );
}
