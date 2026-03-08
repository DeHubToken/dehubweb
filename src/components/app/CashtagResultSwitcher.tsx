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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build list of available results
  const options: ResultOption[] = [];
  if (stockData?.found) {
    options.push({
      id: 'stock',
      label: `$${stockData.symbol}`,
      sublabel: stockData.exchangeShort || stockData.exchange || 'Stock',
      type: 'stock',
    });
  }
  if (dexPair) {
    options.push({
      id: 'crypto',
      label: `$${dexPair.baseToken.symbol}`,
      sublabel: dexPair.chainId?.toUpperCase() || 'Crypto',
      type: 'crypto',
    });
  }

  // Default to stock-first, then crypto
  const [selectedId, setSelectedId] = useState<string>(options[0]?.id || 'stock');

  // Reset selection when options change
  useEffect(() => {
    if (options.length > 0 && !options.find(o => o.id === selectedId)) {
      setSelectedId(options[0].id);
    }
  }, [stockData?.found, dexPair?.pairAddress]);

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
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded",
                      opt.type === 'stock'
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-blue-400/10 text-blue-400"
                    )}>
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
