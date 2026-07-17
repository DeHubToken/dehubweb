import { useState } from 'react';
import type { StockQuote } from '@/hooks/use-stock-quote';
import { TokenPriceChart } from '@/components/app/TokenPriceChart';
import { TrendingUp, TrendingDown, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { QuickBuyButton } from '@/components/app/QuickBuyButton';

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

function formatNumber(n: number | null | undefined): string {
  if (!n) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercent(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className={cn("text-xs font-medium", color || "text-white")}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">{children}</p>;
}

export function StockPriceCard({ data }: StockPriceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPositive = data.percentChange24h != null && data.percentChange24h >= 0;
  const yahooUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(data.symbol)}`;

  const recommendationLabel = data.recommendationKey
    ? data.recommendationKey.charAt(0).toUpperCase() + data.recommendationKey.slice(1).replace('_', ' ')
    : null;

  const recommendationColor = data.recommendationKey
    ? ['strongbuy', 'buy'].includes(data.recommendationKey.toLowerCase())
      ? 'text-emerald-400'
      : ['sell', 'strongsell'].includes(data.recommendationKey.toLowerCase())
        ? 'text-red-400'
        : 'text-amber-400'
    : undefined;

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
                {data.instrumentType === 'ETF' ? 'ETF' : 'Stock'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-sm">{data.name}</span>
              {data.sector && (
                <span className="text-zinc-500 text-[10px] bg-zinc-700/40 px-1.5 py-0.5 rounded">{data.sector}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <QuickBuyButton symbol={data.symbol} tokenType="stock" />
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

      {/* Pre/Post market */}
      {(data.preMarketPrice || data.postMarketPrice) && (
        <div className="px-4 pb-2 flex items-center gap-3 text-xs">
          {data.postMarketPrice != null && (
            <span className="text-zinc-400">
              After hours: <span className="text-white font-medium">{formatPrice(data.postMarketPrice, data.currency)}</span>
              {data.postMarketChangePercent != null && (
                <span className={cn("ml-1", data.postMarketChangePercent >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {formatPercent(data.postMarketChangePercent)}
                </span>
              )}
            </span>
          )}
          {data.preMarketPrice != null && !data.postMarketPrice && (
            <span className="text-zinc-400">
              Pre-market: <span className="text-white font-medium">{formatPrice(data.preMarketPrice, data.currency)}</span>
              {data.preMarketChangePercent != null && (
                <span className={cn("ml-1", data.preMarketChangePercent >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {formatPercent(data.preMarketChangePercent)}
                </span>
              )}
            </span>
          )}
        </div>
      )}

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
        {data.trailingPE != null && (
          <div className="ml-auto">
            <span className="text-zinc-500">P/E</span>
            <p className="text-white font-medium">{data.trailingPE.toFixed(2)}</p>
          </div>
        )}
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
            <div className="border-t border-zinc-700/50">
              {/* 52-Week Range */}
              {(data.fiftyTwoWeekHigh != null || data.fiftyTwoWeekLow != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>52-Week Range</SectionTitle>
                  {data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null && (
                    <>
                      <StatRow label="52W Low" value={formatPrice(data.fiftyTwoWeekLow, data.currency)} />
                      <StatRow label="52W High" value={formatPrice(data.fiftyTwoWeekHigh, data.currency)} />
                      {data.price != null && (
                        <div className="mt-2">
                          <div className="w-full h-1.5 rounded-full bg-zinc-700/50 overflow-hidden relative">
                            <div
                              className="h-full bg-emerald-400 rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(0, ((data.price - data.fiftyTwoWeekLow) / (data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow)) * 100))}%`
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                            <span>{formatPrice(data.fiftyTwoWeekLow, data.currency)}</span>
                            <span>{formatPrice(data.fiftyTwoWeekHigh, data.currency)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Valuation */}
              {(data.trailingPE != null || data.forwardPE != null || data.epsTrailingTwelveMonths != null || data.priceToBook != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Valuation</SectionTitle>
                  {data.trailingPE != null && <StatRow label="P/E (TTM)" value={data.trailingPE.toFixed(2)} />}
                  {data.forwardPE != null && <StatRow label="P/E (Forward)" value={data.forwardPE.toFixed(2)} />}
                  {data.epsTrailingTwelveMonths != null && <StatRow label="EPS (TTM)" value={formatPrice(data.epsTrailingTwelveMonths, data.currency)} />}
                  {data.epsForward != null && <StatRow label="EPS (Forward)" value={formatPrice(data.epsForward, data.currency)} />}
                  {data.epsCurrentYear != null && <StatRow label="EPS (Current Year)" value={formatPrice(data.epsCurrentYear, data.currency)} />}
                  {data.priceToBook != null && <StatRow label="Price/Book" value={data.priceToBook.toFixed(2)} />}
                  {data.bookValue != null && <StatRow label="Book Value" value={formatPrice(data.bookValue, data.currency)} />}
                </div>
              )}

              {/* Moving Averages */}
              {(data.fiftyDayAverage != null || data.twoHundredDayAverage != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Moving Averages</SectionTitle>
                  {data.fiftyDayAverage != null && (
                    <StatRow
                      label="50-Day MA"
                      value={`${formatPrice(data.fiftyDayAverage, data.currency)}${data.fiftyDayAverageChangePercent != null ? ` (${formatPercent(data.fiftyDayAverageChangePercent * 100)})` : ''}`}
                    />
                  )}
                  {data.twoHundredDayAverage != null && (
                    <StatRow
                      label="200-Day MA"
                      value={`${formatPrice(data.twoHundredDayAverage, data.currency)}${data.twoHundredDayAverageChangePercent != null ? ` (${formatPercent(data.twoHundredDayAverageChangePercent * 100)})` : ''}`}
                    />
                  )}
                </div>
              )}

              {/* Dividends */}
              {(data.dividendRate != null || data.dividendYield != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Dividends</SectionTitle>
                  {data.dividendRate != null && <StatRow label="Annual Dividend" value={formatPrice(data.dividendRate, data.currency)} />}
                  {data.dividendYield != null && <StatRow label="Dividend Yield" value={`${(data.dividendYield * 100).toFixed(2)}%`} />}
                  {data.exDividendDate != null && (
                    <StatRow label="Ex-Dividend Date" value={new Date(data.exDividendDate * 1000).toLocaleDateString()} />
                  )}
                </div>
              )}

              {/* Analyst Ratings */}
              {(data.targetMeanPrice != null || recommendationLabel) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Analyst Consensus</SectionTitle>
                  {recommendationLabel && (
                    <StatRow label="Rating" value={recommendationLabel} color={recommendationColor} />
                  )}
                  {data.recommendationMean != null && (
                    <StatRow label="Mean Score" value={`${data.recommendationMean.toFixed(1)} / 5`} />
                  )}
                  {data.numberOfAnalystOpinions != null && (
                    <StatRow label="# Analysts" value={data.numberOfAnalystOpinions.toString()} />
                  )}
                  {data.targetMeanPrice != null && <StatRow label="Target (Mean)" value={formatPrice(data.targetMeanPrice, data.currency)} />}
                  {data.targetHighPrice != null && <StatRow label="Target (High)" value={formatPrice(data.targetHighPrice, data.currency)} />}
                  {data.targetLowPrice != null && <StatRow label="Target (Low)" value={formatPrice(data.targetLowPrice, data.currency)} />}
                </div>
              )}

              {/* Shares & Short Interest */}
              {(data.sharesOutstanding != null || data.floatShares != null || data.shortRatio != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Shares</SectionTitle>
                  {data.sharesOutstanding != null && <StatRow label="Shares Outstanding" value={formatNumber(data.sharesOutstanding)} />}
                  {data.floatShares != null && <StatRow label="Float" value={formatNumber(data.floatShares)} />}
                  {data.shortRatio != null && <StatRow label="Short Ratio" value={data.shortRatio.toFixed(2)} />}
                  {data.shortPercentOfFloat != null && <StatRow label="Short % of Float" value={`${(data.shortPercentOfFloat * 100).toFixed(2)}%`} />}
                </div>
              )}

              {/* Trading */}
              <div className="px-4 py-3 border-b border-zinc-700/30">
                <SectionTitle>Trading</SectionTitle>
                <StatRow label="Previous Close" value={data.previousClose != null ? formatPrice(data.previousClose, data.currency) : '—'} />
                {data.change24h != null && (
                  <StatRow
                    label="Change (Absolute)"
                    value={`${data.change24h >= 0 ? '+' : ''}${formatPrice(data.change24h, data.currency)}`}
                    color={data.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  />
                )}
                {data.bid != null && data.ask != null && (
                  <StatRow label="Bid / Ask" value={`${formatPrice(data.bid, data.currency)} × ${data.bidSize ?? '—'} / ${formatPrice(data.ask, data.currency)} × ${data.askSize ?? '—'}`} />
                )}
                {data.averageDailyVolume10Day != null && (
                  <StatRow label="Avg Volume (10d)" value={formatNumber(data.averageDailyVolume10Day)} />
                )}
                {data.averageDailyVolume3Month != null && (
                  <StatRow label="Avg Volume (3m)" value={formatNumber(data.averageDailyVolume3Month)} />
                )}
              </div>

              {/* Financials */}
              {(data.enterpriseValue != null || data.profitMargins != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Financials</SectionTitle>
                  {data.enterpriseValue != null && <StatRow label="Enterprise Value" value={formatCompact(data.enterpriseValue, data.currency)} />}
                  {data.revenue != null && <StatRow label="Revenue" value={formatCompact(data.revenue, data.currency)} />}
                  {data.revenuePerShare != null && <StatRow label="Revenue/Share" value={formatPrice(data.revenuePerShare, data.currency)} />}
                  {data.profitMargins != null && <StatRow label="Profit Margin" value={`${(data.profitMargins * 100).toFixed(2)}%`} />}
                </div>
              )}

              {/* Earnings */}
              {data.earningsTimestamp != null && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>Earnings</SectionTitle>
                  <StatRow label="Next Earnings" value={new Date(data.earningsTimestamp * 1000).toLocaleDateString()} />
                </div>
              )}

              {/* Company Info */}
              <div className="px-4 py-3 border-b border-zinc-700/30">
                <SectionTitle>Company Info</SectionTitle>
                <StatRow label="Exchange" value={data.exchange} />
                <StatRow label="Type" value={data.instrumentType} />
                <StatRow label="Currency" value={data.currency} />
                {data.sector && <StatRow label="Sector" value={data.sector} />}
                {data.industry && <StatRow label="Industry" value={data.industry} />}
              </div>

              {/* Links */}
              <div className="px-4 py-3">
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
