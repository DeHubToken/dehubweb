/**
 * One NFT tile in the market grid: the art, its name, and the price when it
 * is listed. Square art so a row of mixed collections lines up.
 */
import { useState } from 'react';
import { formatUnits } from 'ethers';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { CHAIN_LABEL } from '@/lib/market/market';

export function formatPrice(amount: string, decimals: number): string {
  const n = Number(formatUnits(BigInt(amount), decimals));
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

export function NftArt({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center bg-white/5 ${className ?? ''}`}>
        <ThemedIcon icon="nfts" alt="" className="h-1/3 w-1/3 object-contain opacity-60" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={`object-cover ${className ?? ''}`}
    />
  );
}

const BADGE = { background: 'rgba(0,0,0,0.62)', color: '#fff' } as const;
// One dot per chain so a mixed grid reads at a glance without a label on every tile.
const CHAIN_DOT: Record<number, string> = { 56: '#F0B90B', 8453: '#0052FF', 1: '#8A92B2', 4663: '#CCFF00' };

export function NftCard({
  name,
  collection,
  image,
  chainId,
  price,
  priceLabel,
  badge,
  compact,
  index = 0,
  onClick,
}: {
  /** Art first, name and price on the image: the market grids. */
  compact?: boolean;
  name: string;
  collection?: string | null;
  image: string | null;
  chainId: number;
  price?: { amount: string; decimals: number; symbol: string } | null;
  priceLabel?: string;
  badge?: string | null;
  /** Position in its grid, for the staggered fade-in. */
  index?: number;
  onClick: () => void;
}) {
  const label = name.trim() || '—';
  return (
    <button
      type="button"
      data-page-bento
      data-nft-card
      onClick={onClick}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl bg-zinc-900 text-left transition-[transform,box-shadow] duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] active:scale-[0.98]"
      style={{ animationDelay: `${Math.min(index, 18) * 35}ms` }}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <NftArt src={image} alt={label} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.06]" />
        {/* Inline colours: these sit on the art, so they must not follow the light themes' text remaps. */}
        <span
          aria-label={CHAIN_LABEL[chainId] ?? String(chainId)}
          title={CHAIN_LABEL[chainId] ?? String(chainId)}
          className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-black/40"
          style={{ background: CHAIN_DOT[chainId] ?? '#fff' }}
        />
        {badge ? (
          <span className="absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={BADGE}>{badge}</span>
        ) : null}
        {compact ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-2 pb-1.5 pt-6"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))', color: '#fff' }}
          >
            <span className="truncate text-[11.5px] font-semibold leading-tight">{label}</span>
            {price ? (
              <span className="truncate text-[11px] font-bold tabular-nums leading-tight" style={{ color: '#fff' }}>
                {formatPrice(price.amount, price.decimals)} {price.symbol}
              </span>
            ) : priceLabel ? (
              <span className="truncate text-[10.5px] leading-tight" style={{ color: 'rgba(255,255,255,0.7)' }}>{priceLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {compact ? null : <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        {collection ? <p className="truncate text-[11px] text-zinc-500">{collection}</p> : null}
        <p className="truncate text-[13.5px] font-semibold text-white">{label}</p>
        {price ? (
          <p className="mt-0.5 text-[13px] tabular-nums text-white">
            {priceLabel ? <span className="mr-1 text-[11px] text-zinc-500">{priceLabel}</span> : null}
            {formatPrice(price.amount, price.decimals)} <span className="text-zinc-400">{price.symbol}</span>
          </p>
        ) : null}
      </div>}
    </button>
  );
}
