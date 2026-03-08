import type { DexPair } from '@/hooks/use-dexscreener';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CashtagPriceCardProps {
  pair: DexPair;
  symbol: string;
}

function formatPrice(price: string | null): string {
  if (!price) return '—';
  const num = parseFloat(price);
  if (num >= 1) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (num >= 0.01) return `$${num.toFixed(4)}`;
  if (num >= 0.0001) return `$${num.toFixed(6)}`;
  return `$${num.toFixed(8)}`;
}

function formatCompact(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function CashtagPriceCard({ pair, symbol }: CashtagPriceCardProps) {
  const change24h = pair.priceChange?.h24;
  const isPositive = change24h != null && change24h >= 0;
  const dexScreenerUrl = pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`;

  // Build DexScreener embed chart URL
  const chartEmbedUrl = `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}?embed=1&theme=dark&trades=0&info=0`;

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl overflow-hidden mb-4">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {pair.info?.imageUrl && (
            <img
              src={pair.info.imageUrl}
              alt={pair.baseToken.symbol}
              className="w-10 h-10 rounded-full bg-zinc-700"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-lg">${pair.baseToken.symbol}</span>
              <span className="text-zinc-500 text-xs uppercase">{pair.chainId}</span>
            </div>
            <span className="text-zinc-400 text-sm">{pair.baseToken.name}</span>
          </div>
        </div>
        <a
          href={dexScreenerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-white transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Price + Change */}
      <div className="px-4 pb-3 flex items-end gap-3">
        <span className="text-white font-bold text-2xl">{formatPrice(pair.priceUsd)}</span>
        {change24h != null && (
          <span className={cn(
            "flex items-center gap-1 text-sm font-medium pb-0.5",
            isPositive ? "text-emerald-400" : "text-red-400"
          )}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
            <span className="text-zinc-500 text-xs ml-1">24h</span>
          </span>
        )}
      </div>

      {/* Chart embed */}
      <div className="w-full h-[200px] bg-zinc-900">
        <iframe
          src={chartEmbedUrl}
          className="w-full h-full border-0"
          title={`${pair.baseToken.symbol} chart`}
          loading="lazy"
        />
      </div>

      {/* Stats row */}
      <div className="px-4 py-3 flex items-center gap-4 text-xs border-t border-zinc-700/50">
        <div>
          <span className="text-zinc-500">Market Cap</span>
          <p className="text-white font-medium">{formatCompact(pair.marketCap || pair.fdv)}</p>
        </div>
        <div>
          <span className="text-zinc-500">Liquidity</span>
          <p className="text-white font-medium">{formatCompact(pair.liquidity?.usd)}</p>
        </div>
        <div>
          <span className="text-zinc-500">24h Vol</span>
          <p className="text-white font-medium">{formatCompact(pair.volume?.h24)}</p>
        </div>
        {pair.dexId && (
          <div className="ml-auto">
            <span className="text-zinc-500">DEX</span>
            <p className="text-white font-medium capitalize">{pair.dexId}</p>
          </div>
        )}
      </div>
    </div>
  );
}
