import type { StockQuote } from '@/hooks/use-stock-quote';
import { TokenPriceChart } from '@/components/app/TokenPriceChart';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockPriceCardProps {
  data: StockQuote;
}

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return '—';
  const sym = currency === 'GBp' ? '£' : currency === 'EUR' ? '€' : currency === 'JPY' ? '¥' : '$';
  return `${sym}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompact(n: number | null | undefined, currency = 'USD'): string {
  if (!n) return '—';
  const sym = currency === 'GBp' ? '£' : currency === 'EUR' ? '€' : currency === 'JPY' ? '¥' : '$';
  if (n >= 1_000_000_000_000) return `${sym}${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toFixed(0)}`;
}

export function StockPriceCard({ data }: StockPriceCardProps) {
  const isPositive = data.percentChange24h != null && data.percentChange24h >= 0;
  const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(data.symbol)}`;

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl overflow-hidden mb-4">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold text-sm">
            {data.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-lg">${data.symbol}</span>
              <span className="text-zinc-500 text-xs uppercase bg-zinc-700/50 px-1.5 py-0.5 rounded">
                {data.exchangeShort || data.exchange}
              </span>
              <span className="text-emerald-400 text-xs bg-emerald-400/10 px-1.5 py-0.5 rounded font-medium">
                Stock
              </span>
            </div>
            <span className="text-zinc-400 text-sm">{data.name}</span>
          </div>
        </div>
        <a
          href={yahooUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-white transition-colors p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Price + Change */}
      <div className="px-4 pb-3 flex items-end gap-3">
        <span className="text-white font-bold text-2xl">
          {formatPrice(data.price, data.currency)}
        </span>
        {data.percentChange24h != null && (
          <span className={cn(
            "flex items-center gap-1 text-sm font-medium pb-0.5",
            isPositive ? "text-emerald-400" : "text-red-400"
          )}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositive ? '+' : ''}{data.percentChange24h.toFixed(2)}%
            <span className="text-zinc-500 text-xs ml-1">1D</span>
          </span>
        )}
      </div>

      {/* Chart */}
      <TokenPriceChart data={data.chartData || []} isLoading={false} />

      {/* Stats row */}
      <div className="px-4 py-3 flex items-center gap-4 text-xs border-t border-zinc-700/50">
        {data.marketCap && (
          <div>
            <span className="text-zinc-500">Market Cap</span>
            <p className="text-white font-medium">{formatCompact(data.marketCap, data.currency)}</p>
          </div>
        )}
        {data.volume24h && (
          <div>
            <span className="text-zinc-500">Volume</span>
            <p className="text-white font-medium">{formatCompact(data.volume24h, data.currency)}</p>
          </div>
        )}
        {data.dayHigh != null && data.dayLow != null && (
          <div>
            <span className="text-zinc-500">Day Range</span>
            <p className="text-white font-medium">
              {formatPrice(data.dayLow, data.currency)} – {formatPrice(data.dayHigh, data.currency)}
            </p>
          </div>
        )}
        <div className="ml-auto">
          <span className="text-zinc-500">Currency</span>
          <p className="text-white font-medium">{data.currency}</p>
        </div>
      </div>
    </div>
  );
}
