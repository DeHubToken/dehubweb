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

export function NftCard({
  name,
  collection,
  image,
  chainId,
  price,
  priceLabel,
  badge,
  onClick,
}: {
  name: string;
  collection?: string | null;
  image: string | null;
  chainId: number;
  price?: { amount: string; decimals: number; symbol: string } | null;
  priceLabel?: string;
  badge?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-page-bento
      data-nft-card
      onClick={onClick}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl bg-zinc-900 text-left transition-transform active:scale-[0.98]"
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <NftArt src={image} alt={name} className="h-full w-full" />
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {CHAIN_LABEL[chainId] ?? chainId}
        </span>
        {badge ? (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 p-2.5">
        {collection ? <p className="truncate text-[11px] text-zinc-500">{collection}</p> : null}
        <p className="truncate text-[13.5px] font-semibold text-white">{name}</p>
        {price ? (
          <p className="mt-0.5 text-[13px] tabular-nums text-white">
            {priceLabel ? <span className="mr-1 text-[11px] text-zinc-500">{priceLabel}</span> : null}
            {formatPrice(price.amount, price.decimals)} <span className="text-zinc-400">{price.symbol}</span>
          </p>
        ) : null}
      </div>
    </button>
  );
}
