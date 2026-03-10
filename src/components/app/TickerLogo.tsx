import { useState } from 'react';

interface TickerLogoProps {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Displays a token/stock logo with multiple fallback sources:
 * 1. Synth Finance (stocks — high hit rate)
 * 2. CoinGecko search-based icon via symbol match
 * 3. Logo.dev / Clearbit style
 * 4. First-letter fallback
 */
export function TickerLogo({ symbol, size = 16, className = '' }: TickerLogoProps) {
  const [srcIndex, setSrcIndex] = useState(0);
  const clean = symbol.replace(/^\$/, '').toUpperCase();

  const sources = [
    // Synth Finance — works well for stocks & some crypto
    `https://logo.synthfinance.com/ticker/${clean}`,
    // Logo.dev / Clearbit style for well-known tickers
    `https://logo.clearbit.com/${clean.toLowerCase()}.com`,
  ];

  if (srcIndex >= sources.length) {
    // All sources failed — show letter fallback
    return (
      <div
        className={`shrink-0 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.55 }}
      >
        {clean.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={sources[srcIndex]}
      alt={clean}
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => setSrcIndex(prev => prev + 1)}
      loading="lazy"
    />
  );
}
