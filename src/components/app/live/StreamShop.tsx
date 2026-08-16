/**
 * Live Stream Shop
 * ================
 * Viewer-facing surfaces for a stream's product rail:
 *
 *  - `StreamShopPinnedCard` — the product the host is talking about right now,
 *    floated over the player.
 *  - `StreamShopRail` — everything attached to the stream, under the player.
 *
 * Prices render in DHB with a USD subtitle, matching StoreListingCard. These
 * numbers are display only; the amount a buyer actually signs for is quoted by
 * the live-checkout function at the moment they press Buy.
 */

import { memo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageIcon, ShoppingBag, X, ChevronRight } from 'lucide-react';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useStreamProducts, effectivePrice, type StreamProduct } from '@/hooks/use-stream-shopping';
import { StreamCheckoutDrawer } from './StreamCheckoutDrawer';
import dehubCoin from '@/assets/dehub-coin.png';
import { cn } from '@/lib/utils';

/** Below this, say how many are left — urgency is only fair when it's true. */
const LOW_STOCK_THRESHOLD = 10;

function usePriceParts(product: StreamProduct) {
  const { data: prices } = useTokenPrices();
  const dhbPrice = prices?.DHB ?? 0;
  const priceUsd = effectivePrice(product);
  const listPrice = Number(product.store_listings?.price ?? 0);
  const isDiscounted = product.live_price != null && product.live_price < listPrice;
  return {
    priceUsd,
    listPrice,
    isDiscounted,
    dhb: dhbPrice > 0 ? Math.ceil(priceUsd / dhbPrice) : null,
    listDhb: dhbPrice > 0 ? Math.ceil(listPrice / dhbPrice) : null,
  };
}

function PriceTag({ product, className }: { product: StreamProduct; className?: string }) {
  const { priceUsd, isDiscounted, dhb, listDhb } = usePriceParts(product);
  return (
    <div className={cn('flex items-baseline gap-1.5', className)}>
      <span className="flex items-center gap-1 font-semibold text-white">
        <img src={dehubCoin} alt="" className="w-4 h-4" />
        {dhb !== null ? dhb.toLocaleString() : `$${priceUsd.toLocaleString()}`}
      </span>
      {isDiscounted && listDhb !== null && (
        <span className="text-xs text-zinc-500 line-through">{listDhb.toLocaleString()}</span>
      )}
    </div>
  );
}

function StockNote({ product }: { product: StreamProduct }) {
  const stock = product.store_listings?.stock_quantity;
  if (stock === null || stock === undefined) return null;
  if (stock > LOW_STOCK_THRESHOLD) return null;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
      {stock === 1 ? 'Last one' : `${stock} left`}
    </span>
  );
}

function ProductThumb({ product, className }: { product: StreamProduct; className?: string }) {
  const image = product.store_listings?.images?.[0];
  return (
    <div className={cn('bg-white/5 overflow-hidden shrink-0 flex items-center justify-center', className)}>
      {image ? (
        <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="w-5 h-5 text-zinc-600" />
      )}
    </div>
  );
}

/**
 * The pinned product, floated over the player.
 *
 * Sits above the player's own control bar so it never swallows play/mute, and
 * the viewer can fold it away — a shopping card that cannot be dismissed is an
 * advert covering a video someone chose to watch. Dismissal is per-pin: pinning
 * something new brings the card back, which is the host's cue working as
 * intended rather than a viewer being re-nagged about the same item.
 */
export function StreamShopPinnedCard({ tokenId }: { tokenId: string | null }) {
  const { pinned } = useStreamProducts(tokenId);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const visible = pinned && pinned.id !== dismissedId;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute bottom-14 left-3 right-3 sm:right-auto sm:max-w-xs z-20 pointer-events-auto"
          >
            <div className="flex items-center gap-2.5 p-2 pr-2.5 rounded-xl bg-black/70 backdrop-blur-xl border border-white/15 shadow-lg">
              <ProductThumb product={pinned} className="w-12 h-12 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">
                  {pinned.store_listings?.title}
                </p>
                <div className="flex items-center gap-2">
                  <PriceTag product={pinned} className="text-sm" />
                  <StockNote product={pinned} />
                </div>
              </div>
              <button
                onClick={() => setCheckoutOpen(true)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors"
              >
                Buy
              </button>
              <button
                onClick={() => setDismissedId(pinned.id)}
                aria-label="Hide this product"
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pinned && (
        <StreamCheckoutDrawer
          tokenId={tokenId}
          product={pinned}
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </>
  );
}

const RailCard = memo(function RailCard({
  product,
  onBuy,
}: {
  product: StreamProduct;
  onBuy: () => void;
}) {
  return (
    <button
      onClick={onBuy}
      className="group text-left w-36 shrink-0 rounded-xl border border-white/10 bg-white/5 overflow-hidden hover:border-white/25 transition-colors"
    >
      <div className="relative">
        <ProductThumb product={product} className="w-full aspect-square" />
        {product.is_pinned && (
          <span className="absolute top-1.5 left-1.5 text-[9px] font-bold uppercase tracking-wide bg-white text-black px-1.5 py-0.5 rounded">
            On air
          </span>
        )}
      </div>
      <div className="p-2 space-y-1">
        <p className="text-xs text-white truncate">{product.store_listings?.title}</p>
        <PriceTag product={product} className="text-sm" />
        <StockNote product={product} />
      </div>
    </button>
  );
});

/**
 * The full rail, under the player.
 *
 * Renders nothing at all when the stream has no products — an empty "Shop"
 * heading on every live post would be chrome for a feature most streams do not
 * use.
 */
export function StreamShopRail({ tokenId }: { tokenId: string | null }) {
  const { sellable } = useStreamProducts(tokenId);
  const [checkoutFor, setCheckoutFor] = useState<StreamProduct | null>(null);

  if (!sellable.length) return null;

  return (
    <>
      <div className="mt-3 rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <ShoppingBag className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-white">Shop this stream</h3>
          <span className="text-xs text-zinc-500">{sellable.length}</span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-600 ml-auto sm:hidden" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {sellable.map(product => (
            <RailCard key={product.id} product={product} onBuy={() => setCheckoutFor(product)} />
          ))}
        </div>
      </div>

      {checkoutFor && (
        <StreamCheckoutDrawer
          tokenId={tokenId}
          product={checkoutFor}
          open={!!checkoutFor}
          onClose={() => setCheckoutFor(null)}
        />
      )}
    </>
  );
}
