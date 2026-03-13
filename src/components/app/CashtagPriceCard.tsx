import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DexPair } from '@/hooks/use-dexscreener';
import type { CmcMarketData } from '@/hooks/use-cmc-market-cap';
import { useTokenChart, type ChartTimeframe } from '@/hooks/use-token-chart';
import { TokenPriceChart } from '@/components/app/TokenPriceChart';
import { TrendingUp, TrendingDown, Copy, Check, ChevronDown, ExternalLink, Globe, Twitter, MessageCircle } from 'lucide-react';
import { QuickBuyButton } from '@/components/app/QuickBuyButton';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

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

function formatNumber(n: number | null | undefined): string {
  if (!n) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercent(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function PercentBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-zinc-500 text-[10px]">{label}</span>
      <span className={cn("text-xs font-medium", isPositive ? "text-emerald-400" : "text-red-400")}>
        {formatPercent(value)}
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className="text-white text-xs font-medium">{value}</span>
    </div>
  );
}

export function CashtagPriceCard({ pair, symbol, cmcData }: CashtagPriceCardProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('1D');
  const { data: chartData, isLoading: isChartLoading } = useTokenChart(symbol, true, chartTimeframe);
  
  const change24h = cmcData?.percentChange24h ?? pair.priceChange?.h24;
  const isPositive = change24h != null && change24h >= 0;
  const marketCap = cmcData?.marketCap || pair.marketCap || pair.fdv;
  const volume24h = cmcData?.volume24h || pair.volume?.h24;
  const displayPrice = cmcData?.price ? formatPrice(cmcData.price) : formatPrice(pair.priceUsd);
  
  const contractAddress = pair.baseToken.address;

  const handleCopyCA = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Aggregate txns
  const txns24h = pair.txns?.h24;
  const totalTxns24h = txns24h ? txns24h.buys + txns24h.sells : null;
  const buyRatio = txns24h && totalTxns24h ? Math.round((txns24h.buys / totalTxns24h) * 100) : null;

  // Pair age
  const pairAge = pair.pairCreatedAt
    ? (() => {
        const days = Math.floor((Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60 * 24));
        if (days > 365) return `${Math.floor(days / 365)}y ${days % 365}d`;
        return `${days}d`;
      })()
    : null;

  // Socials from DexScreener
  const dexSocials = pair.info?.socials || [];
  const dexWebsites = pair.info?.websites || [];

  // Combined social links (CMC overrides if available)
  const twitterUrl = cmcData?.twitter || dexSocials.find(s => s.type === 'twitter')?.url;
  const telegramUrl = dexSocials.find(s => s.type === 'telegram')?.url;
  const discordUrl = dexSocials.find(s => s.type === 'discord')?.url;
  const websiteUrl = cmcData?.website || dexWebsites[0]?.url;
  const dexScreenerUrl = pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`;

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl overflow-hidden mb-4">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(cmcData?.logo || pair.info?.imageUrl) && (
            <img
              src={cmcData?.logo || pair.info?.imageUrl}
              alt={pair.baseToken.symbol}
              className="w-10 h-10 rounded-full bg-zinc-700"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-lg">${pair.baseToken.symbol}</span>
              
              {cmcData?.cmcRank && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.location.href = '/app/top-100'; }}
                  className="text-zinc-400 text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded hover:bg-zinc-600/50 hover:text-white transition-colors cursor-pointer"
                  title="View Top 100 Cryptocurrencies"
                >#{cmcData.cmcRank}</button>
              )}
            </div>
            <span className="text-zinc-400 text-sm">{cmcData?.name || pair.baseToken.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <QuickBuyButton
                    symbol={pair.baseToken.symbol}
                    tokenType="crypto"
                    tokenAddress={pair.baseToken.address}
                    chainId={pair.chainId}
                    tokenLogo={pair.info?.imageUrl}
                  />
          <button
            onClick={handleCopyCA}
            className="text-zinc-400 hover:text-white transition-colors p-1.5"
            title="Copy contract address"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
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
      <TokenPriceChart
        data={chartData || []}
        isLoading={isChartLoading}
        timeframe={chartTimeframe}
        onTimeframeChange={setChartTimeframe}
      />

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
              {/* Price Changes Row */}
              <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-zinc-700/30">
                <PercentBadge value={pair.priceChange?.m5} label="5m" />
                <PercentBadge value={cmcData?.percentChange1h ?? pair.priceChange?.h1} label="1h" />
                <PercentBadge value={pair.priceChange?.h6} label="6h" />
                <PercentBadge value={change24h} label="24h" />
                <PercentBadge value={cmcData?.percentChange7d} label="7d" />
                <PercentBadge value={cmcData?.percentChange30d} label="30d" />
                <PercentBadge value={cmcData?.percentChange90d} label="90d" />
              </div>

              {/* Transaction Activity */}
              {txns24h && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">24h Transactions</p>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-emerald-400 text-xs font-medium">{txns24h.buys} buys</span>
                    <span className="text-red-400 text-xs font-medium">{txns24h.sells} sells</span>
                    <span className="text-zinc-400 text-xs ml-auto">{totalTxns24h} total</span>
                  </div>
                  {buyRatio != null && (
                    <div className="w-full h-1.5 rounded-full bg-red-400/30 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all"
                        style={{ width: `${buyRatio}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Multi-timeframe volume */}
              {pair.volume && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">Volume</p>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <span className="text-zinc-500 text-[10px]">5m</span>
                      <p className="text-white text-xs font-medium">{formatCompact(pair.volume.m5)}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-zinc-500 text-[10px]">1h</span>
                      <p className="text-white text-xs font-medium">{formatCompact(pair.volume.h1)}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-zinc-500 text-[10px]">6h</span>
                      <p className="text-white text-xs font-medium">{formatCompact(pair.volume.h6)}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-zinc-500 text-[10px]">24h</span>
                      <p className="text-white text-xs font-medium">{formatCompact(pair.volume.h24)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Supply & Market Data */}
              <div className="px-4 py-3 border-b border-zinc-700/30">
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Market Data</p>
                {cmcData?.fullyDilutedMarketCap && (
                  <StatRow label="Fully Diluted MC" value={formatCompact(cmcData.fullyDilutedMarketCap)} />
                )}
                {cmcData?.circulatingSupply && (
                  <StatRow label="Circulating Supply" value={formatNumber(cmcData.circulatingSupply)} />
                )}
                {cmcData?.totalSupply && (
                  <StatRow label="Total Supply" value={formatNumber(cmcData.totalSupply)} />
                )}
                {cmcData?.maxSupply && (
                  <StatRow label="Max Supply" value={formatNumber(cmcData.maxSupply)} />
                )}
                {cmcData?.volumeChange24h != null && (
                  <StatRow label="Volume Change 24h" value={`${formatPercent(cmcData.volumeChange24h)}`} />
                )}
                {cmcData?.marketCapDominance != null && cmcData.marketCapDominance > 0 && (
                  <StatRow label="Market Dominance" value={`${cmcData.marketCapDominance.toFixed(4)}%`} />
                )}
                {pairAge && (
                  <StatRow label="Pool Age" value={pairAge} />
                )}
                <StatRow label="Quote Token" value={`${pair.quoteToken.symbol} (${pair.quoteToken.name})`} />
                <StatRow label="Price (Native)" value={pair.priceNative} />
              </div>

              {/* Liquidity Breakdown */}
              {pair.liquidity && (pair.liquidity.base || pair.liquidity.quote) && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Liquidity Breakdown</p>
                  <StatRow label="Total (USD)" value={formatCompact(pair.liquidity.usd)} />
                  {pair.liquidity.base != null && (
                    <StatRow label={`${pair.baseToken.symbol}`} value={formatNumber(pair.liquidity.base)} />
                  )}
                  {pair.liquidity.quote != null && (
                    <StatRow label={`${pair.quoteToken.symbol}`} value={formatNumber(pair.liquidity.quote)} />
                  )}
                </div>
              )}

              {/* Contract & Platform */}
              <div className="px-4 py-3 border-b border-zinc-700/30">
                <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Contract</p>
                <div className="flex items-center gap-2 py-1">
                  <span className="text-zinc-400 text-xs truncate flex-1 font-mono">{contractAddress}</span>
                  <button onClick={handleCopyCA} className="text-zinc-500 hover:text-white p-1 shrink-0">
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <StatRow label="Chain" value={pair.chainId.toUpperCase()} />
                <StatRow label="DEX" value={pair.dexId} />
                {pair.labels?.length ? (
                  <StatRow label="Pool Type" value={pair.labels.join(', ')} />
                ) : null}
                {cmcData?.platform && (
                  <StatRow label="Platform" value={`${cmcData.platform.name} (${cmcData.platform.symbol})`} />
                )}
                {cmcData?.dateAdded && (
                  <StatRow label="CMC Listed" value={new Date(cmcData.dateAdded).toLocaleDateString()} />
                )}
              </div>

              {/* Description */}
              {cmcData?.description && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">About</p>
                  <p className="text-zinc-300 text-xs leading-relaxed line-clamp-4">{cmcData.description}</p>
                </div>
              )}

              {/* Tags */}
              {cmcData?.tags && cmcData.tags.length > 0 && (
                <div className="px-4 py-3 border-b border-zinc-700/30">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cmcData.tags.slice(0, 10).map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-300">
                        {tag}
                      </span>
                    ))}
                    {cmcData.tags.length > 10 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-500">
                        +{cmcData.tags.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Links */}
              <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                {websiteUrl && (
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Globe className="w-3.5 h-3.5" /> Website
                  </a>
                )}
                {twitterUrl && (
                  <a href={twitterUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Twitter className="w-3.5 h-3.5" /> Twitter
                  </a>
                )}
                {telegramUrl && (
                  <a href={telegramUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  </a>
                )}
                {discordUrl && (
                  <a href={discordUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Discord
                  </a>
                )}
                {cmcData?.reddit && (
                  <a href={cmcData.reddit} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Globe className="w-3.5 h-3.5" /> Reddit
                  </a>
                )}
                {cmcData?.sourceCode && (
                  <a href={cmcData.sourceCode} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Globe className="w-3.5 h-3.5" /> Source
                  </a>
                )}
                {cmcData?.explorer && cmcData.explorer.length > 0 && (
                  <a href={cmcData.explorer[0]} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Explorer
                  </a>
                )}
                <a href={dexScreenerUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-700/40 hover:bg-zinc-700/70 px-2.5 py-1.5 rounded-lg transition-colors ml-auto">
                  <ExternalLink className="w-3.5 h-3.5" /> DexScreener
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
