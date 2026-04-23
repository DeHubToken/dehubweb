/**
 * Store / Listing Link Embeds
 * ============================
 * Detects store and store-listing URLs in post content and renders them as
 * inline preview cards (mirrors how CommunityLinkEmbed works for communities).
 *
 * URL formats detected:
 *  - /app/stores/<storeId>?listing=<listingId>  → listing card
 *  - /app/stores/<storeId>                      → store card
 */

import { useNavigate } from 'react-router-dom';
import { ImageIcon, Store as StoreIcon } from 'lucide-react';
import { useStoreById, useStoreListing } from '@/hooks/use-stores';
import { useTokenPrices } from '@/hooks/use-token-prices';
import dehubCoin from '@/assets/dehub-coin.png';

const STORE_PATH_RE = /\/app\/stores\/([a-fA-F0-9-]{8,})(?:\?[^\s]*?listing=([a-fA-F0-9-]{8,}))?/;

/** Returns { storeId, listingId } if a store/listing URL is present. */
export function extractStoreLinkInfo(text: string): { storeId: string; listingId: string | null } | null {
  const m = text.match(STORE_PATH_RE);
  if (!m) return null;
  return { storeId: m[1], listingId: m[2] || null };
}

export function hasStoreLink(text: string): boolean {
  return STORE_PATH_RE.test(text);
}

interface Props {
  storeId: string;
  listingId: string | null;
}

export function StoreLinkEmbed({ storeId, listingId }: Props) {
  if (listingId) return <ListingEmbed listingId={listingId} />;
  return <StoreEmbed storeId={storeId} />;
}

// ── Listing card ────────────────────────────────────────────
function ListingEmbed({ listingId }: { listingId: string }) {
  const navigate = useNavigate();
  const { data: listing, isLoading } = useStoreListing(listingId);
  const { data: prices } = useTokenPrices();

  if (isLoading) {
    return <div className="mt-2 h-24 rounded-xl bg-white/[0.04] animate-pulse" />;
  }
  if (!listing) return null;

  const images = (listing.images as string[]) || [];
  const firstImage = images[0];
  const storeName = (listing as any).stores?.name || 'Store';
  const dhbPrice = prices?.DHB ?? 0;
  const priceUsd = Number(listing.price);
  const priceDhb = dhbPrice > 0 ? priceUsd / dhbPrice : 0;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/stores/${listing.store_id}?listing=${listing.id}`);
      }}
      data-no-navigate
      className="w-full flex items-stretch gap-3 p-2 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left overflow-hidden"
    >
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0 relative">
        {firstImage ? (
          <img src={firstImage} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-zinc-500" />
        )}
        {listing.stock_quantity === 0 && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white/80">SOLD OUT</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 py-1 pr-2 flex flex-col justify-center gap-0.5">
        <p className="text-sm font-semibold text-white truncate">{listing.title}</p>
        <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
          <StoreIcon className="w-3 h-3" /> {storeName}
        </p>
        <p className="text-sm font-semibold text-white flex items-center gap-1 mt-0.5">
          {dhbPrice > 0 ? (
            <>
              <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
              {Math.ceil(priceDhb).toLocaleString()}
            </>
          ) : (
            `$${priceUsd.toLocaleString()}`
          )}
          <span className="text-[10px] text-zinc-500 font-normal ml-1">
            ${priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </p>
      </div>
    </button>
  );
}

// ── Store card ──────────────────────────────────────────────
function StoreEmbed({ storeId }: { storeId: string }) {
  const navigate = useNavigate();
  const { data: store, isLoading } = useStoreById(storeId);

  if (isLoading) {
    return <div className="mt-2 h-16 rounded-xl bg-white/[0.04] animate-pulse" />;
  }
  if (!store) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/stores/${store.id}`);
      }}
      data-no-navigate
      className="w-full flex items-center gap-3 p-3 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left relative overflow-hidden"
    >
      {store.banner_url && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${store.banner_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.42,
            maskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 30%, black 70%)',
          }}
        />
      )}
      <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
        {store.avatar_url ? (
          <img src={store.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <StoreIcon className="w-5 h-5 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 min-w-0 relative">
        <p className="text-sm font-semibold text-white truncate">{store.name || 'Store'}</p>
        {store.description && (
          <p className="text-xs text-zinc-500 truncate mt-0.5">{store.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <StoreIcon className="w-3 h-3 text-zinc-500" />
          <span className="text-xs text-zinc-500">View store</span>
        </div>
      </div>
    </button>
  );
}
