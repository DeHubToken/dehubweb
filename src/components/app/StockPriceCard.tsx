import { useTranslation as _useCopy } from 'react-i18next';
import { useState, lazy, Suspense } from 'react';
import type { StockQuote } from '@/hooks/use-stock-quote';
// Lazy: keeps recharts out of the eager feed path (see CashtagPriceCard).
const TokenPriceChart = lazy(() =>
  import('@/components/app/TokenPriceChart').then(m => ({ default: m.TokenPriceChart }))
);
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
  const { t: _copy } = _useCopy();
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
                {data.instrumentType === 'ETF' ? _copy("copy.f80cac6f6a85", { defaultValue: "ETF" }) : _copy("copy.d5cade7ef319", { defaultValue: "Stock" })}
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
            title={_copy("copy.7dd4d97d9aae", { defaultValue: "More info" })}
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
            <span className="text-zinc-400">{_copy("copy.7dbef8d0c1ba", { defaultValue: "After hours: " })}<span className="text-white font-medium">{formatPrice(data.postMarketPrice, data.currency)}</span>
              {data.postMarketChangePercent != null && (
                <span className={cn("ml-1", data.postMarketChangePercent >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {formatPercent(data.postMarketChangePercent)}
                </span>
              )}
            </span>
          )}
          {data.preMarketPrice != null && !data.postMarketPrice && (
            <span className="text-zinc-400">{_copy("copy.8fd9ae2eea2d", { defaultValue: "Pre-market: " })}<span className="text-white font-medium">{formatPrice(data.preMarketPrice, data.currency)}</span>
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
      <Suspense fallback={<div className="w-full h-[180px] bg-zinc-900/50" />}>
        <TokenPriceChart data={data.chartData || []} isLoading={false} />
      </Suspense>

      {/* Stats row */}
      <div className="px-4 py-3 flex items-center gap-4 text-xs border-t border-zinc-700/50">
        {data.marketCap && (
          <div>
            <span className="text-zinc-500">{_copy("copy.fb25999766b1", { defaultValue: "Market Cap" })}</span>
            <p className="text-white font-medium">{formatCompact(data.marketCap, data.currency)}</p>
          </div>
        )}
        {data.volume24h && (
          <div>
            <span className="text-zinc-500">{_copy("copy.b10fb966d720", { defaultValue: "Volume" })}</span>
            <p className="text-white font-medium">{formatCompact(data.volume24h, data.currency)}</p>
          </div>
        )}
        {data.dayHigh != null && data.dayLow != null && (
          <div>
            <span className="text-zinc-500">{_copy("copy.de596950e758", { defaultValue: "Day Range" })}</span>
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
                  <SectionTitle>{_copy("copy.c4ffe5737502", { defaultValue: "52-Week Range" })}</SectionTitle>
                  {data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null && (
                    <>
                      <StatRow label={_copy("copy.736e32671628", { defaultValue: "52W Low" })} value={formatPrice(data.fiftyTwoWeekLow, data.currency)} />
                      <StatRow label={_copy("copy.bf370792fe48", { defaultValue: "52W High" })} value={formatPrice(data.fiftyTwoWeekHigh, data.currency)} />
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
                  <SectionTitle>{_copy("copy.c49d9c4f4572", { defaultValue: "Valuation" })}</SectionTitle>
                  {data.trailingPE != null && <StatRow label={_copy("copy.46f50f3107ee", { defaultValue: "P/E (TTM)" })} value={data.trailingPE.toFixed(2)} />}
                  {data.forwardPE != null && <StatRow label={_copy("copy.0a5d0f8bb70a", { defaultValue: "P/E (Forward)" })} value={data.forwardPE.toFixed(2)} />}
                  {data.epsTrailingTwelveMonths != null && <StatRow label={_copy("copy.c0d4c5406f01", { defaultValue: "EPS (TTM)" })} value={formatPrice(data.epsTrailingTwelveMonths, data.currency)} />}
                  {data.epsForward != null && <StatRow label={_copy("copy.48a2d44bf2c8", { defaultValue: "EPS (Forward)" })} value={formatPrice(data.epsForward, data.currency)} />}
                  {data.epsCurrentYear != null && <StatRow label={_copy("copy.b92727206967", { defaultValue: "EPS (Current Year)" })} value={formatPrice(data.epsCurrentYear, data.currency)} />}
                  {data.priceToBook != null && <StatRow label={_copy("copy.9675a5615bbe", { defaultValue: "Price/Book" })} value={data.priceToBook.toFixed(2)} />}
                  {data.bookValue != null && <StatRow label={_copy("copy.80bff5300130", { defaultValue: "Book Value" })} value={formatPrice(data.bookValue, data.currency)} />}
                </div>
              )}

              {/* Moving Averages */}
              {(data.fiftyDayAverage != null || data.twoHundredDayAverage != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>{_copy("copy.50710864a072", { defaultValue: "Moving Averages" })}</SectionTitle>
                  {data.fiftyDayAverage != null && (
                    <StatRow
                      label={_copy("copy.e6163204f9b0", { defaultValue: "50-Day MA" })}
                      value={`${formatPrice(data.fiftyDayAverage, data.currency)}${data.fiftyDayAverageChangePercent != null ? ` (${formatPercent(data.fiftyDayAverageChangePercent * 100)})` : ''}`}
                    />
                  )}
                  {data.twoHundredDayAverage != null && (
                    <StatRow
                      label={_copy("copy.0548fa7bdba8", { defaultValue: "200-Day MA" })}
                      value={`${formatPrice(data.twoHundredDayAverage, data.currency)}${data.twoHundredDayAverageChangePercent != null ? ` (${formatPercent(data.twoHundredDayAverageChangePercent * 100)})` : ''}`}
                    />
                  )}
                </div>
              )}

              {/* Dividends */}
              {(data.dividendRate != null || data.dividendYield != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>{_copy("copy.6e0b22a7cbc0", { defaultValue: "Dividends" })}</SectionTitle>
                  {data.dividendRate != null && <StatRow label={_copy("copy.9031bdeee7ac", { defaultValue: "Annual Dividend" })} value={formatPrice(data.dividendRate, data.currency)} />}
                  {data.dividendYield != null && <StatRow label={_copy("copy.b43b86317a9e", { defaultValue: "Dividend Yield" })} value={`${(data.dividendYield * 100).toFixed(2)}%`} />}
                  {data.exDividendDate != null && (
                    <StatRow label={_copy("copy.0e3909f00cbc", { defaultValue: "Ex-Dividend Date" })} value={new Date(data.exDividendDate * 1000).toLocaleDateString()} />
                  )}
                </div>
              )}

              {/* Analyst Ratings */}
              {(data.targetMeanPrice != null || recommendationLabel) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>{_copy("copy.1d35f42dc8cc", { defaultValue: "Analyst Consensus" })}</SectionTitle>
                  {recommendationLabel && (
                    <StatRow label={_copy("copy.9f29530464f7", { defaultValue: "Rating" })} value={recommendationLabel} color={recommendationColor} />
                  )}
                  {data.recommendationMean != null && (
                    <StatRow label={_copy("copy.8c3a7bb39f68", { defaultValue: "Mean Score" })} value={`${data.recommendationMean.toFixed(1)} / 5`} />
                  )}
                  {data.numberOfAnalystOpinions != null && (
                    <StatRow label={_copy("copy.08bdc351bbbe", { defaultValue: "# Analysts" })} value={data.numberOfAnalystOpinions.toString()} />
                  )}
                  {data.targetMeanPrice != null && <StatRow label={_copy("copy.82d4f829bf92", { defaultValue: "Target (Mean)" })} value={formatPrice(data.targetMeanPrice, data.currency)} />}
                  {data.targetHighPrice != null && <StatRow label={_copy("copy.4d27a5eacc4f", { defaultValue: "Target (High)" })} value={formatPrice(data.targetHighPrice, data.currency)} />}
                  {data.targetLowPrice != null && <StatRow label={_copy("copy.a8a5dae56867", { defaultValue: "Target (Low)" })} value={formatPrice(data.targetLowPrice, data.currency)} />}
                </div>
              )}

              {/* Shares & Short Interest */}
              {(data.sharesOutstanding != null || data.floatShares != null || data.shortRatio != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>{_copy("copy.d4ea333d8b1f", { defaultValue: "Shares" })}</SectionTitle>
                  {data.sharesOutstanding != null && <StatRow label={_copy("copy.186b466bdd3b", { defaultValue: "Shares Outstanding" })} value={formatNumber(data.sharesOutstanding)} />}
                  {data.floatShares != null && <StatRow label={_copy("copy.1a693c00c40c", { defaultValue: "Float" })} value={formatNumber(data.floatShares)} />}
                  {data.shortRatio != null && <StatRow label={_copy("copy.8d6091fdfacb", { defaultValue: "Short Ratio" })} value={data.shortRatio.toFixed(2)} />}
                  {data.shortPercentOfFloat != null && <StatRow label={_copy("copy.be39cd4d55e6", { defaultValue: "Short % of Float" })} value={`${(data.shortPercentOfFloat * 100).toFixed(2)}%`} />}
                </div>
              )}

              {/* Trading */}
              <div className="px-4 py-3 border-b border-zinc-700/30">
                <SectionTitle>{_copy("copy.fde20a1b4621", { defaultValue: "Trading" })}</SectionTitle>
                <StatRow label={_copy("copy.a9688779c0b8", { defaultValue: "Previous Close" })} value={data.previousClose != null ? formatPrice(data.previousClose, data.currency) : '—'} />
                {data.change24h != null && (
                  <StatRow
                    label={_copy("copy.406474c2483b", { defaultValue: "Change (Absolute)" })}
                    value={`${data.change24h >= 0 ? '+' : ''}${formatPrice(data.change24h, data.currency)}`}
                    color={data.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  />
                )}
                {data.bid != null && data.ask != null && (
                  <StatRow label={_copy("copy.694bd43602c6", { defaultValue: "Bid / Ask" })} value={`${formatPrice(data.bid, data.currency)} × ${data.bidSize ?? '—'} / ${formatPrice(data.ask, data.currency)} × ${data.askSize ?? '—'}`} />
                )}
                {data.averageDailyVolume10Day != null && (
                  <StatRow label={_copy("copy.4d8a4057771f", { defaultValue: "Avg Volume (10d)" })} value={formatNumber(data.averageDailyVolume10Day)} />
                )}
                {data.averageDailyVolume3Month != null && (
                  <StatRow label={_copy("copy.c44b14bd3c76", { defaultValue: "Avg Volume (3m)" })} value={formatNumber(data.averageDailyVolume3Month)} />
                )}
              </div>

              {/* Financials */}
              {(data.enterpriseValue != null || data.profitMargins != null) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>{_copy("copy.4e4f1565fb7c", { defaultValue: "Financials" })}</SectionTitle>
                  {data.enterpriseValue != null && <StatRow label={_copy("copy.9eb0a50a94cc", { defaultValue: "Enterprise Value" })} value={formatCompact(data.enterpriseValue, data.currency)} />}
                  {data.revenue != null && <StatRow label={_copy("copy.c4b7330bd91e", { defaultValue: "Revenue" })} value={formatCompact(data.revenue, data.currency)} />}
                  {data.revenuePerShare != null && <StatRow label={_copy("copy.ef223f92946e", { defaultValue: "Revenue/Share" })} value={formatPrice(data.revenuePerShare, data.currency)} />}
                  {data.profitMargins != null && <StatRow label={_copy("copy.30242b1819ad", { defaultValue: "Profit Margin" })} value={`${(data.profitMargins * 100).toFixed(2)}%`} />}
                </div>
              )}

              {/* Earnings */}
              {data.earningsTimestamp != null && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <SectionTitle>{_copy("copy.81920761dd55", { defaultValue: "Earnings" })}</SectionTitle>
                  <StatRow label={_copy("copy.47446c03c79b", { defaultValue: "Next Earnings" })} value={new Date(data.earningsTimestamp * 1000).toLocaleDateString()} />
                </div>
              )}

              {/* Company Info */}
              <div className="px-4 py-3 border-b border-zinc-700/30">
                <SectionTitle>{_copy("copy.cd82232bedf1", { defaultValue: "Company Info" })}</SectionTitle>
                <StatRow label={_copy("copy.d60a318dd8a0", { defaultValue: "Exchange" })} value={data.exchange} />
                <StatRow label={_copy("copy.baaddf70fb5d", { defaultValue: "Type" })} value={data.instrumentType} />
                <StatRow label={_copy("copy.3ac1a9ec4fa7", { defaultValue: "Currency" })} value={data.currency} />
                {data.sector && <StatRow label={_copy("copy.31a231c06e6d", { defaultValue: "Sector" })} value={data.sector} />}
                {data.industry && <StatRow label={_copy("copy.b44484a0fa28", { defaultValue: "Industry" })} value={data.industry} />}
              </div>

              {/* Links */}
              <div className="px-4 py-3">
                <a href={yahooUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors w-fit">
                  <ExternalLink className="w-3.5 h-3.5" />{_copy("copy.396228de7a9c", { defaultValue: " Yahoo Finance" })}</a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
