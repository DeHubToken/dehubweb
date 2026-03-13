import { useCmcTop100, type CmcCoin } from '@/hooks/use-cmc-top-100';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function CoinRow({ coin, onClick }: { coin: CmcCoin; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
    >
      <td className="py-3 px-3 text-zinc-400 text-sm font-medium">{coin.rank}</td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <img
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`}
            alt={coin.symbol}
            className="w-6 h-6 rounded-full"
            loading="lazy"
          />
          <span className="text-white font-medium text-sm">{coin.name}</span>
          <span className="text-zinc-500 text-xs">{coin.symbol}</span>
        </div>
      </td>
      <td className="py-3 px-3 text-white text-sm text-right font-mono">{formatPrice(coin.price)}</td>
      <td className="py-3 px-3 text-right hidden sm:table-cell"><PercentBadge value={coin.percent_change_1h} /></td>
      <td className="py-3 px-3 text-right"><PercentBadge value={coin.percent_change_24h} /></td>
      <td className="py-3 px-3 text-right hidden md:table-cell"><PercentBadge value={coin.percent_change_7d} /></td>
      <td className="py-3 px-3 text-right text-zinc-300 text-sm font-mono hidden lg:table-cell">{formatLargeNumber(coin.market_cap)}</td>
      <td className="py-3 px-3 text-right text-zinc-400 text-sm font-mono hidden xl:table-cell">{formatLargeNumber(coin.volume_24h)}</td>
    </tr>
  );
}

export default function Top100CryptosPage() {
  const { data: coins, isLoading, error } = useCmcTop100();
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-white">Top Cryptocurrencies</h1>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-center py-10">Failed to load data. Please try again later.</div>
      )}

      {coins && coins.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 text-zinc-500 text-xs uppercase">
                <th className="py-3 px-3 text-left">#</th>
                <th className="py-3 px-3 text-left">Name</th>
                <th className="py-3 px-3 text-right">Price</th>
                <th className="py-3 px-3 text-right hidden sm:table-cell">1h</th>
                <th className="py-3 px-3 text-right">24h</th>
                <th className="py-3 px-3 text-right hidden md:table-cell">7d</th>
                <th className="py-3 px-3 text-right hidden lg:table-cell">Market Cap</th>
                <th className="py-3 px-3 text-right hidden xl:table-cell">Volume (24h)</th>
              </tr>
            </thead>
            <tbody>
              {coins.map(coin => (
                <CoinRow
                  key={coin.id}
                  coin={coin}
                  onClick={() => navigate(`/app/explore?q=$${coin.symbol}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
