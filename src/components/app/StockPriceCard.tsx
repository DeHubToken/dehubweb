import { useState } from 'react';
import type { StockQuote } from '@/hooks/use-stock-quote';
import { TokenPriceChart } from '@/components/app/TokenPriceChart';
import { TrendingUp, TrendingDown, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

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
  const [expanded, setExpanded] = useState(false);
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
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={cn(
            "text-zinc-400 hover:text-white transition-all p-1.5 rounded-lg",
            expanded && "bg-zinc-700/50 text-white"
          )}
          title="More info"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </button>
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

      {/* Expanded Detail Panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-700/50 px-4 py-3">
              <div className="flex justify-between items-center py-1.5">
                <span className="text-zinc-500 text-xs">Previous Close</span>
                <span className="text-white text-xs font-medium">{data.previousClose != null ? formatPrice(data.previousClose, data.currency) : '—'}</span>
              </div>
              {data.change24h != null && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-zinc-500 text-xs">Change (Absolute)</span>
                  <span className={cn("text-xs font-medium", data.change24h >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {data.change24h >= 0 ? '+' : ''}{formatPrice(data.change24h, data.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5">
                <span className="text-zinc-500 text-xs">Exchange</span>
                <span className="text-white text-xs font-medium">{data.exchange}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-zinc-500 text-xs">Type</span>
                <span className="text-white text-xs font-medium capitalize">{data.instrumentType}</span>
              </div>
              <div className="pt-2">
                <a href={yahooUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors w-fit">
                  <ExternalLink className="w-3.5 h-3.5" /> Yahoo Finance
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
