import { useState } from 'react';
import type { DexPair } from '@/hooks/use-dexscreener';
import type { CmcMarketData } from '@/hooks/use-cmc-market-cap';
import { useTokenChart } from '@/hooks/use-token-chart';
import { TokenPriceChart } from '@/components/app/TokenPriceChart';
import { TrendingUp, TrendingDown, ExternalLink, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CashtagPriceCardProps {
  pair: DexPair;
  symbol: string;
  cmcData?: CmcMarketData | null;
}

function formatPrice(price: string | number | null): string {
  if (!price) return '—';
  const num = typeof price === 'string' ? parseFloat(price) : price;
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

export function CashtagPriceCard({ pair, symbol, cmcData }: CashtagPriceCardProps) {
  const [copied, setCopied] = useState(false);
  const { data: chartData, isLoading: isChartLoading } = useTokenChart(symbol, true);
  
  // Use CMC data when available, fallback to DexScreener
  const change24h = cmcData?.percentChange24h ?? pair.priceChange?.h24;
  const isPositive = change24h != null && change24h >= 0;
  const marketCap = cmcData?.marketCap || pair.marketCap || pair.fdv;
  const volume24h = cmcData?.volume24h || pair.volume?.h24;
  const displayPrice = cmcData?.price ? formatPrice(cmcData.price) : formatPrice(pair.priceUsd);
  
  const dexScreenerUrl = pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`;
  const contractAddress = pair.baseToken.address;

  const handleCopyCA = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              {cmcData?.cmcRank && (
                <span className="text-zinc-400 text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded">#{cmcData.cmcRank}</span>
              )}
            </div>
            <span className="text-zinc-400 text-sm">{cmcData?.name || pair.baseToken.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCA}
            className="text-zinc-400 hover:text-white transition-colors p-1"
            title="Copy contract address"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <a
            href={dexScreenerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-white transition-colors p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Price + Change */}
      <div className="px-4 pb-3 flex items-end gap-3">
        <span className="text-white font-bold text-2xl">{displayPrice}</span>
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

      {/* Price Chart */}
      <TokenPriceChart data={chartData || []} isLoading={isChartLoading} />

      {/* Stats row */}
      <div className="px-4 py-3 flex items-center gap-4 text-xs border-t border-zinc-700/50">
        <div>
          <span className="text-zinc-500">Market Cap{cmcData?.marketCap ? '' : ' (DEX)'}</span>
          <p className="text-white font-medium">{formatCompact(marketCap)}</p>
        </div>
        <div>
          <span className="text-zinc-500">Liquidity</span>
          <p className="text-white font-medium">{formatCompact(pair.liquidity?.usd)}</p>
        </div>
        <div>
          <span className="text-zinc-500">24h Vol</span>
          <p className="text-white font-medium">{formatCompact(volume24h)}</p>
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
