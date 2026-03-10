import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface TickerLogoProps {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Fetches a token logo URL from DexScreener search API.
 * Cached via react-query so we only hit the API once per symbol.
 */
async function fetchDexLogo(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = data?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    // Find exact symbol match with an image
    const upper = symbol.toUpperCase();
    const match = pairs.find(
      (p: any) => p.baseToken?.symbol?.toUpperCase() === upper && p.info?.imageUrl
    );
    return match?.info?.imageUrl || null;
  } catch {
    return null;
  }
}

/**
 * Displays a token/stock logo with multiple fallback sources:
 * 1. Synth Finance (stocks)
 * 2. DexScreener (crypto — real API lookup)
 * 3. First-letter fallback
 */
export function TickerLogo({ symbol, size = 16, className = '' }: TickerLogoProps) {
  const [synthFailed, setSynthFailed] = useState(false);
  const clean = symbol.replace(/^\$/, '').toUpperCase();

  // Only query DexScreener if synth failed
  const { data: dexLogo } = useQuery({
    queryKey: ['ticker-logo-dex', clean],
    queryFn: () => fetchDexLogo(clean),
    enabled: synthFailed,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const synthUrl = `https://logo.synthfinance.com/ticker/${clean}`;

  // Synth succeeded — show it
  if (!synthFailed) {
    return (
      <img
        src={synthUrl}
        alt={clean}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setSynthFailed(true)}
        loading="lazy"
      />
    );
  }

  // Synth failed, try DexScreener logo
  if (dexLogo) {
    return (
      <img
        src={dexLogo}
        alt={clean}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => {}} // already last image source
        loading="lazy"
      />
    );
  }

  // Letter fallback
  return (
    <div
      className={`shrink-0 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 font-bold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      {clean.charAt(0)}
    </div>
  );
}
