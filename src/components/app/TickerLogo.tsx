import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface TickerLogoProps {
  symbol: string;
  size?: number;
  className?: string;
}

/** Well-known crypto logos from CoinGecko CDN — instant, no API call needed. */
const KNOWN_LOGOS: Record<string, string> = {
  BTC: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  BNB: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  SOL: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png',
  XRP: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  DOGE: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png',
  ADA: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png',
  AVAX: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  DOT: 'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.png',
  MATIC: 'https://coin-images.coingecko.com/coins/images/4713/large/polygon.png',
  LINK: 'https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
  UNI: 'https://coin-images.coingecko.com/coins/images/12504/large/uni.jpg',
  SHIB: 'https://coin-images.coingecko.com/coins/images/11939/large/shiba.png',
  PEPE: 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg',
  NEAR: 'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg',
  TRX: 'https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png',
  USDT: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png',
  USDC: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
};

/** Stock/ETF symbol → company domain for Clearbit logo fallback */
const STOCK_DOMAINS: Record<string, string> = {
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  NVDA: 'nvidia.com',
  AMZN: 'amazon.com',
  GOOG: 'google.com',
  GOOGL: 'google.com',
  META: 'meta.com',
  TSLA: 'tesla.com',
  'BRK-B': 'berkshirehathaway.com',
  'BRK.B': 'berkshirehathaway.com',
  'BRK-A': 'berkshirehathaway.com',
  TSM: 'tsmc.com',
  AVGO: 'broadcom.com',
  JPM: 'jpmorganchase.com',
  LLY: 'lilly.com',
  V: 'visa.com',
  UNH: 'unitedhealthgroup.com',
  MA: 'mastercard.com',
  WMT: 'walmart.com',
  XOM: 'exxonmobil.com',
  HD: 'homedepot.com',
  PG: 'pg.com',
  JNJ: 'jnj.com',
  COST: 'costco.com',
  ABBV: 'abbvie.com',
  BAC: 'bankofamerica.com',
  KO: 'coca-cola.com',
  NFLX: 'netflix.com',
  CRM: 'salesforce.com',
  ORCL: 'oracle.com',
  AMD: 'amd.com',
  MRK: 'merck.com',
  PEP: 'pepsico.com',
  TMO: 'thermofisher.com',
  CSCO: 'cisco.com',
  ABT: 'abbott.com',
  DHR: 'danaher.com',
  CMCSA: 'comcast.com',
  NKE: 'nike.com',
  DIS: 'disney.com',
  INTC: 'intel.com',
  VZ: 'verizon.com',
  ADBE: 'adobe.com',
  QCOM: 'qualcomm.com',
  TXN: 'ti.com',
  INTU: 'intuit.com',
  PM: 'pmi.com',
  IBM: 'ibm.com',
  GE: 'ge.com',
  CAT: 'caterpillar.com',
  BA: 'boeing.com',
};

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
 * 0. Known hardcoded logos (instant, no fetch)
 * 1. Synth Finance (stocks)
 * 2. Clearbit (stocks — domain-based fallback)
 * 3. CoinGecko (crypto)
 * 4. DexScreener (crypto)
 * 5. First-letter fallback
 */
export function TickerLogo({ symbol, size = 16, className = '' }: TickerLogoProps) {
  const [synthFailed, setSynthFailed] = useState(false);
  const [clearbitFailed, setClearbitFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [cgImgFailed, setCgImgFailed] = useState(false);
  const [dexFailed, setDexFailed] = useState(false);
  const clean = symbol.replace(/^\$/, '').toUpperCase();

  // 0. Hardcoded known logos — instant render
  const knownLogo = KNOWN_LOGOS[clean];
  const stockDomain = STOCK_DOMAINS[clean];

  // 1. CoinGecko — always fetch (fast, reliable for crypto)
  const { data: cgLogo, isFetched: cgFetched } = useQuery({
    queryKey: ['ticker-logo-cg', clean],
    queryFn: () => fetchCoinGeckoLogo(clean),
    enabled: !knownLogo, // skip if we already know this token
    staleTime: 5 * 60_000,
    retry: false,
  });

  // 2. DexScreener — only if CoinGecko returned nothing
  const { data: dexLogo } = useQuery({
    queryKey: ['ticker-logo-dex', clean],
    queryFn: () => fetchDexLogo(clean),
    enabled: !knownLogo && cgFetched && !cgLogo && synthFailed && (!stockDomain || clearbitFailed),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const imgClass = `shrink-0 rounded-full object-cover ${className}`;

  // Known logo — instant
  if (knownLogo) {
    return (
      <img src={knownLogo} alt={clean} width={size} height={size} className={imgClass} loading="lazy" />
    );
  }

  // Synth Finance (stocks) — try first render
  const synthUrl = `https://logo.synthfinance.com/ticker/${clean}`;
  if (!synthFailed) {
    return (
      <img
        src={synthUrl}
        alt={clean}
        width={size}
        height={size}
        className={imgClass}
        onError={() => setSynthFailed(true)}
        loading="lazy"
      />
    );
  }

  // Clearbit (stocks) — domain-based fallback
  if (stockDomain && !clearbitFailed) {
    const clearbitUrl = `https://logo.clearbit.com/${stockDomain}`;
    return (
      <img
        src={clearbitUrl}
        alt={clean}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-contain bg-white p-0.5 ${className}`}
        onError={() => setClearbitFailed(true)}
        loading="lazy"
      />
    );
  }

  // Google Favicon fallback (stocks with known domain)
  if (stockDomain && !faviconFailed) {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${stockDomain}&sz=128`;
    return (
      <img
        src={faviconUrl}
        alt={clean}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-contain bg-white p-0.5 ${className}`}
        onError={() => setFaviconFailed(true)}
        loading="lazy"
      />
    );
  }

  // CoinGecko logo
  if (cgLogo && !cgImgFailed) {
    return (
      <img
        src={cgLogo}
        alt={clean}
        width={size}
        height={size}
        className={imgClass}
        onError={() => setCgImgFailed(true)}
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
        className={imgClass}
        onError={() => setDexFailed(true)}
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
