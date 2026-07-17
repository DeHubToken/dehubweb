/**
 * Community Ticker Search
 * =======================
 * DexScreener-powered ticker search for community owners to assign a token chart.
 * Shows search results with price, volume, chain info — lets owner pick the right pair.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { DexPair } from '@/hooks/use-dexscreener';

interface CommunityTickerSearchProps {
  onSelect: (pair: DexPair) => void;
  onCancel: () => void;
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

export function CommunityTickerSearch({ onSelect, onCancel }: CommunityTickerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DexPair[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchDex = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); return; }

    setLoading(true);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) { setResults([]); return; }
      const data = await res.json();
      const pairs: DexPair[] = data.pairs || [];

      // Sort by volume to show most relevant pairs first
      const sorted = pairs.sort((a, b) => {
        const aVol = a.volume?.h24 || 0;
        const bVol = b.volume?.h24 || 0;
        return bVol - aVol;
      });

      // Deduplicate by chain+address
      const seen = new Set<string>();
      const deduped: DexPair[] = [];
      for (const pair of sorted) {
        const key = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(pair);
        if (deduped.length >= 8) break;
      }

      setResults(deduped);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => searchDex(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchDex]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search token symbol or contract address..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-600 outline-none"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); }} className="text-zinc-500 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button onClick={onCancel} className="text-zinc-500 hover:text-white text-xs">
          Cancel
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-xs text-zinc-500">Searching...</span>
        </div>
      )}

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-1 max-h-[300px] overflow-y-auto"
          >
            {results.map((pair) => {
              const change24h = pair.priceChange?.h24;
              const isPos = change24h != null && change24h >= 0;
              return (
                <button
                  key={`${pair.chainId}-${pair.pairAddress}`}
                  onClick={() => onSelect(pair)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-left"
                >
                  {pair.info?.imageUrl && (
                    <img src={pair.info.imageUrl} alt="" className="w-8 h-8 rounded-full bg-zinc-700 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white text-sm font-medium">${pair.baseToken.symbol}</span>
                      <span className="text-zinc-500 text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded">{pair.chainId.toUpperCase()}</span>
                    </div>
                    <p className="text-zinc-500 text-[10px] truncate">{pair.baseToken.name}</p>
                    <p className="text-zinc-600 text-[9px] font-mono truncate mt-0.5">{pair.baseToken.address}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white text-xs font-medium">{formatPrice(pair.priceUsd)}</p>
                    {change24h != null && (
                      <p className={cn("text-[10px]", isPos ? "text-emerald-400" : "text-red-400")}>
                        {isPos ? '+' : ''}{change24h.toFixed(2)}%
                      </p>
                    )}
                    <p className="text-zinc-600 text-[9px]">Vol: {formatCompact(pair.volume?.h24)}</p>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && query.length >= 2 && results.length === 0 && (
        <p className="text-zinc-600 text-xs text-center py-3">No tokens found for "{query}"</p>
      )}
    </div>
  );
}
