import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StockPriceCard } from '@/components/app/StockPriceCard';
import { CashtagPriceCard } from '@/components/app/CashtagPriceCard';
import type { StockQuote } from '@/hooks/use-stock-quote';
import type { DexPair } from '@/hooks/use-dexscreener';
import type { CmcMarketData } from '@/hooks/use-cmc-market-cap';
import { AnimatePresence, motion } from 'framer-motion';

interface CashtagResultSwitcherProps {
  stockData: StockQuote | null;
  dexPair: DexPair | null;
  cmcData: CmcMarketData | null | undefined;
  symbol: string;
}

type ResultOption = {
  id: string;
  label: string;
  sublabel: string;
  type: 'stock' | 'crypto';
};

export function CashtagResultSwitcher({ stockData, dexPair, cmcData, symbol }: CashtagResultSwitcherProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [userPicked, setUserPicked] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Score how much useful data each result has — weighted by quality signals
  const stockScore = stockData?.found
    ? [
        stockData.price,
        stockData.marketCap && stockData.marketCap > 0 ? stockData.marketCap : null, // real market cap = strong signal
        stockData.volume24h && stockData.volume24h > 0 ? stockData.volume24h : null,
        stockData.dayHigh,
        stockData.percentChange24h,
        stockData.name,
        stockData.trailingPE,
        stockData.epsTrailingTwelveMonths,
        stockData.fiftyTwoWeekHigh,
        stockData.sharesOutstanding,
        stockData.sector,
        stockData.industry,
        stockData.targetMeanPrice,
        stockData.dividendRate,
      ].filter(Boolean).length
    : 0;

  const cryptoScore = dexPair
    ? [
        dexPair.priceUsd,
        dexPair.marketCap && dexPair.marketCap > 1000 ? dexPair.marketCap : null, // ignore dust market caps
        dexPair.volume?.h24 && dexPair.volume.h24 > 100 ? dexPair.volume.h24 : null, // ignore near-zero volume
        dexPair.liquidity?.usd && dexPair.liquidity.usd > 100 ? dexPair.liquidity.usd : null,
        dexPair.priceChange?.h24,
        dexPair.baseToken?.name,
        dexPair.txns?.h24 && (dexPair.txns.h24.buys + dexPair.txns.h24.sells) > 10 ? true : null,
        dexPair.info?.imageUrl,
        cmcData?.marketCap && cmcData.marketCap > 1000 ? cmcData.marketCap : null,
        cmcData?.circulatingSupply,
        cmcData?.description,
        cmcData?.logo,
      ].filter(Boolean).length
    : 0;

  // Determine best default
  const bestId = stockScore >= cryptoScore ? 'stock' : 'crypto';

  // Build list of available results — order by richest data first
  const options: ResultOption[] = [];
  const stockOption: ResultOption | null = stockData?.found
    ? { id: 'stock', label: `$${stockData.symbol}`, sublabel: stockData.exchangeShort || stockData.exchange || 'Stock', type: 'stock' }
    : null;
  const cryptoOption: ResultOption | null = dexPair
    ? { id: 'crypto', label: `$${dexPair.baseToken.symbol}`, sublabel: dexPair.chainId?.toUpperCase() || 'Crypto', type: 'crypto' }
    : null;

  // Put the richer result first
  if (bestId === 'crypto') {
    if (cryptoOption) options.push(cryptoOption);
    if (stockOption) options.push(stockOption);
  } else {
    if (stockOption) options.push(stockOption);
    if (cryptoOption) options.push(cryptoOption);
  }

  const [selectedId, setSelectedId] = useState<string>(options[0]?.id || 'stock');

  // Auto-select best option as data loads (unless user manually picked)
  useEffect(() => {
    if (userPicked) return;
    if (options.length > 0) {
      setSelectedId(options[0].id);
    }
  }, [stockScore, cryptoScore, stockData?.found, dexPair?.pairAddress, userPicked]);

  // Reset userPicked when symbol changes
  useEffect(() => {
    setUserPicked(false);
  }, [symbol]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  if (options.length === 0) return null;

  const hasMultiple = options.length > 1;
  const selected = options.find(o => o.id === selectedId) || options[0];

  return (
    <div className="relative">
      {/* Switcher header — only show when multiple results */}
      {hasMultiple && (
        <div ref={dropdownRef} className="relative mb-2">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 text-sm text-white hover:bg-zinc-700/80 transition-colors"
          >
            <span className="font-medium">{selected.label}</span>
            <span className="text-zinc-500 text-xs">{selected.sublabel}</span>
            <ChevronDown className={cn(
              "w-3.5 h-3.5 text-zinc-400 transition-transform",
              showDropdown && "rotate-180"
            )} />
          </button>

          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-xl bg-zinc-800 border border-zinc-700/50 overflow-hidden shadow-xl"
              >
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSelectedId(opt.id);
                      setShowDropdown(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-700/50 transition-colors",
                      opt.id === selectedId && "bg-zinc-700/30"
                    )}
                  >
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/10 text-white">
                      {opt.type === 'stock' ? 'Stock' : 'Crypto'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-medium">{opt.label}</span>
                      <span className="text-zinc-500 text-xs ml-2">{opt.sublabel}</span>
                    </div>
                    {opt.id === selectedId && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Render selected card */}
      {selectedId === 'stock' && stockData?.found ? (
        <StockPriceCard data={stockData} />
      ) : selectedId === 'crypto' && dexPair ? (
        <CashtagPriceCard pair={dexPair} symbol={symbol} cmcData={cmcData} />
      ) : stockData?.found ? (
        <StockPriceCard data={stockData} />
      ) : dexPair ? (
        <CashtagPriceCard pair={dexPair} symbol={symbol} cmcData={cmcData} />
      ) : null}
    </div>
  );
}
