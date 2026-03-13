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
  dexPairs: DexPair[];
  cmcData: CmcMarketData | null | undefined;
  symbol: string;
}

type ResultOption = {
  id: string;
  label: string;
  sublabel: string;
  type: 'stock' | 'crypto';
  pairIndex?: number; // index into dexPairs array
};

export function CashtagResultSwitcher({ stockData, dexPairs, cmcData, symbol }: CashtagResultSwitcherProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [userPicked, setUserPicked] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build options list
  const options: ResultOption[] = [];

  // Stock option
  if (stockData?.found) {
    options.push({
      id: 'stock',
      label: `$${stockData.symbol}`,
      sublabel: stockData.exchangeShort || stockData.exchange || 'Stock',
      type: 'stock',
    });
  }

  // Token options — one per chain
  dexPairs.forEach((pair, i) => {
    options.push({
      id: `crypto-${i}`,
      label: `$${pair.baseToken.symbol}`,
      sublabel: 'Token',
      type: 'crypto',
      pairIndex: i,
    });
  });

  // Score stock vs top crypto to determine default ordering
  const stockScore = stockData?.found
    ? [stockData.price, stockData.marketCap && stockData.marketCap > 0, stockData.volume24h && stockData.volume24h > 0,
       stockData.dayHigh, stockData.percentChange24h, stockData.name, stockData.trailingPE,
       stockData.epsTrailingTwelveMonths, stockData.fiftyTwoWeekHigh, stockData.sharesOutstanding,
       stockData.sector, stockData.industry, stockData.targetMeanPrice, stockData.dividendRate].filter(Boolean).length
    : 0;

  const topPair = dexPairs[0];
  const cryptoScore = topPair
    ? [topPair.priceUsd, topPair.marketCap && topPair.marketCap > 1000,
       topPair.volume?.h24 && topPair.volume.h24 > 100, topPair.liquidity?.usd && topPair.liquidity.usd > 100,
       topPair.priceChange?.h24, topPair.baseToken?.name,
       topPair.txns?.h24 && (topPair.txns.h24.buys + topPair.txns.h24.sells) > 10,
       topPair.info?.imageUrl, cmcData?.marketCap && cmcData.marketCap > 1000,
       cmcData?.circulatingSupply, cmcData?.description, cmcData?.logo].filter(Boolean).length
    : 0;

  const cryptoOnBase = topPair?.chainId === 'base';
  const cryptoFirst = cryptoOnBase || cryptoScore > stockScore;

  // Re-sort: put preferred type first
  if (cryptoFirst) {
    options.sort((a, b) => {
      if (a.type === 'crypto' && b.type === 'stock') return -1;
      if (a.type === 'stock' && b.type === 'crypto') return 1;
      return 0;
    });
  } else {
    options.sort((a, b) => {
      if (a.type === 'stock' && b.type === 'crypto') return -1;
      if (a.type === 'crypto' && b.type === 'stock') return 1;
      return 0;
    });
  }

  const [selectedId, setSelectedId] = useState<string>(options[0]?.id || 'stock');

  // Auto-select best option as data loads (unless user manually picked)
  useEffect(() => {
    if (userPicked) return;
    if (options.length > 0) {
      setSelectedId(options[0].id);
    }
  }, [stockScore, cryptoScore, stockData?.found, dexPairs.length, userPicked]);

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

  // Resolve which pair to render
  const selectedPair = selected.type === 'crypto' && selected.pairIndex !== undefined
    ? dexPairs[selected.pairIndex]
    : null;

  return (
    <div className="relative">
      {hasMultiple && (
        <div ref={dropdownRef} className="relative mb-2">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/50 text-sm text-foreground hover:bg-zinc-700/80 transition-colors"
          >
            <span className="font-medium text-white">{selected.label}</span>
            <span className="text-white/60 text-xs">{selected.type === 'stock' ? 'Stock' : 'Token'}</span>
            <span className="text-white/60 text-xs ml-1">({options.length})</span>
            <ChevronDown className={cn(
              "w-3.5 h-3.5 text-white/60 transition-transform",
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
                className="absolute top-full left-0 mt-1 z-50 min-w-[220px] rounded-xl bg-zinc-800 border border-zinc-700/50 overflow-hidden shadow-xl"
              >
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSelectedId(opt.id);
                      setUserPicked(true);
                      setShowDropdown(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-700/50 transition-colors",
                      opt.id === selectedId && "bg-zinc-700/30"
                    )}
                  >
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/10 text-white">
                      {opt.type === 'stock' ? 'Stock' : 'Token'}
                    </span>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{opt.label}</span>
                    </div>
                    {opt.id === selectedId && (
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Render selected card */}
      {selected.type === 'stock' && stockData?.found ? (
        <StockPriceCard data={stockData} />
      ) : selectedPair ? (
        <CashtagPriceCard pair={selectedPair} symbol={symbol} cmcData={selected.pairIndex === 0 ? cmcData : undefined} />
      ) : stockData?.found ? (
        <StockPriceCard data={stockData} />
      ) : dexPairs[0] ? (
        <CashtagPriceCard pair={dexPairs[0]} symbol={symbol} cmcData={cmcData} />
      ) : null}
    </div>
  );
}
