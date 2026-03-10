import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface TickerLogoProps {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Fetches a token logo URL from DexScreener search API.
 */
async function fetchDexLogo(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = data?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

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
 * Fetches a token logo from CoinGecko search API.
 */
async function fetchCoinGeckoLogo(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const coins = data?.coins;
    if (!Array.isArray(coins) || coins.length === 0) return null;

    const upper = symbol.toUpperCase();
    const match = coins.find(
      (c: any) => c.symbol?.toUpperCase() === upper
    );
    return match?.large || match?.thumb || null;
  } catch {
    return null;
  }
}

/**
 * Displays a token/stock logo with multiple fallback sources:
 * 1. Synth Finance (stocks)
 * 2. DexScreener (crypto)
 * 3. CoinGecko (crypto)
 * 4. First-letter fallback
 */
export function TickerLogo({ symbol, size = 16, className = '' }: TickerLogoProps) {
  const [synthFailed, setSynthFailed] = useState(false);
  const [dexFailed, setDexFailed] = useState(false);
  const clean = symbol.replace(/^\$/, '').toUpperCase();

  const { data: dexLogo, isFetched: dexFetched } = useQuery({
    queryKey: ['ticker-logo-dex', clean],
    queryFn: () => fetchDexLogo(clean),
    enabled: synthFailed,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Query CoinGecko if both synth and dex failed/returned nothing
  const { data: cgLogo } = useQuery({
    queryKey: ['ticker-logo-cg', clean],
    queryFn: () => fetchCoinGeckoLogo(clean),
    enabled: synthFailed && dexFetched && (!dexLogo || dexFailed),
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

  // DexScreener logo
  if (dexLogo && !dexFailed) {
    return (
      <img
        src={dexLogo}
        alt={clean}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setDexFailed(true)}
        loading="lazy"
      />
    );
  }

  // CoinGecko logo
  if (cgLogo) {
    return (
      <img
        src={cgLogo}
        alt={clean}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
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
