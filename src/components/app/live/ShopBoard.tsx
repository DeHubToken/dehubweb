/**
 * Shop board
 * ==========
 * What a creator is selling or pointing at, behind a Shop button on the post.
 * Two kinds of row:
 *
 *  - **Listings** from their own DeHub shop, which check out in-app through
 *    `live-checkout` — server-quoted and chain-verified, the same path the
 *    live shopping rail uses.
 *  - **Affiliate links**, which leave the app.
 *
 * Listings come first. Something a viewer can buy here without going anywhere
 * is worth more to both sides than a link that hands them to Amazon, and the
 * ordering is the only place that preference gets expressed.
 *
 * **The listing rows are fetched on open, never with the feed.** A feed is
 * twenty cards; a board that queried Supabase on mount would cost twenty
 * queries and twenty realtime channels to draw a button. The token's
 * `shopListingCount` answers "is there anything here" for free, because it
 * rides the feed payload — so the button can be right before anything is
 * fetched, and `useStreamProducts` only runs once somebody taps.
 *
 * That count is a hint and can be stale (a listing detached from the live
 * manager mid-broadcast does not come back through it). The rows themselves
 * come from `stream_products`, which is ownership-checked, so a stale count
 * shows a shorter board rather than something the creator does not sell.
 *
 * **It lives inside the player container on live, not in a portal.** A `Drawer`
 * would be dismissed by fullscreen and would cover a phone screen for three
 * rows; positioning it against the player means it survives fullscreen (the
 * same reason `StreamShopPinnedCard` sits there) and keeps the stream visible
 * above it — nobody wants to leave the broadcast to look at a link.
 *
 * Every affiliate row is disclosed as one and carries
 * `rel="sponsored nofollow noopener noreferrer"`. Neither is optional and
 * neither is the creator's job to remember, so the surface does both.
 *
 * Renders nothing when the post has no board at all, so it is safe to drop into
 * any player or card.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, ExternalLink, ImageIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTokenPrices } from '@/hooks/use-token-prices';
import {
  useStreamProducts,
  effectivePrice,
  type StreamProduct,
} from '@/hooks/use-stream-shopping';
import { StreamCheckoutDrawer } from './StreamCheckoutDrawer';
import dehubCoin from '@/assets/dehub-coin.png';
import type { ShopLink } from '@/lib/api/dehub';

interface ShopBoardProps {
  /** The post's tokenId — what `stream_products` is keyed on. */
  tokenId?: string | null;
  links?: ShopLink[] | null;
  /**
   * How many store listings the post claims, straight off the feed payload.
   * Lets the button be right before a single row is fetched.
   */
  listingCount?: number | null;
  /**
   * `overlay` floats the button over a player and slides the board up from the
   * bottom of it — the live and video surfaces, where the board must not take
   * the viewer away from what is playing.
   *
   * `inline` is for a post with no player of its own (an image, a text post):
   * the button sits in the flow and the board expands beneath it.
   */
  variant?: 'overlay' | 'inline';
  /**
   * Where the button sits. The overlay default clears the control bar on the
   * right; pass a class to move it when a surface already has something there.
   */
  className?: string;
}

/** `https://www.amazon.co.uk/dp/x?tag=…` reads as `amazon.co.uk` under the label. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Below this, say how many are left — urgency is only fair when it is true. */
const LOW_STOCK_THRESHOLD = 10;

function ListingRow({
  product,
  onBuy,
}: {
  product: StreamProduct;
  onBuy: () => void;
}) {
  const { t } = useTranslation();
  const { data: prices } = useTokenPrices();
  const dhbPrice = prices?.DHB ?? 0;
  const priceUsd = effectivePrice(product);
  // Display only. The amount a buyer signs for is quoted by live-checkout when
  // the drawer opens — dividing a USD price by a token price in the browser is
  // exactly the bug that made the marketplace drawer send 0 DHB.
  const dhb = dhbPrice > 0 ? Math.ceil(priceUsd / dhbPrice) : null;
  const listing = product.store_listings;
  const stock = listing?.stock_quantity;
  const image = listing?.images?.[0];

  return (
    <button
      type="button"
      onClick={onBuy}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="w-4 h-4 text-zinc-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{listing?.title}</p>
        <div className="flex items-baseline gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-white">
            <img src={dehubCoin} alt="" className="w-3 h-3" />
            {dhb !== null ? dhb.toLocaleString() : `$${priceUsd.toLocaleString()}`}
          </span>
          {stock !== null && stock !== undefined && stock <= LOW_STOCK_THRESHOLD && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              {stock === 1 ? t('live.lastOne') : t('live.stockLeft', { count: stock })}
            </span>
          )}
        </div>
      </div>
      <span className="text-xs font-medium text-white/70 shrink-0">{t('live.buy')}</span>
    </button>
  );
}

export function ShopBoard({
  tokenId,
  links,
  listingCount,
  variant = 'overlay',
  className,
}: ShopBoardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState<StreamProduct | null>(null);
  const overlay = variant === 'overlay';

  const linkRows = links ?? [];
  const claimedListings = Math.max(0, listingCount ?? 0);

  // Only once the board is open — see the note at the top of the file.
  const { sellable, isLoading } = useStreamProducts(tokenId ?? null, open && claimedListings > 0);

  // A board left open while the viewer scrolls to the next post would reopen on
  // somebody else's shop, since the card is recycled.
  useEffect(() => {
    setOpen(false);
    setCheckout(null);
  }, [tokenId, links]);

  // The button draws off the claim, so it is right before anything is fetched.
  const total = linkRows.length + claimedListings;
  if (total === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1.5 px-3 h-9 rounded-full',
          'bg-black/50 backdrop-blur-2xl border border-white/15 text-white text-sm font-medium',
          'hover:bg-black/70 transition-colors',
          overlay ? 'absolute z-20 left-3 bottom-3' : 'mt-2',
          className,
        )}
      >
        <ShoppingBag className="w-4 h-4" />
        {t('live.shop')}
        <span className="text-white/50 text-xs">{total}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={overlay ? { y: '100%', opacity: 0 } : { height: 0, opacity: 0 }}
            animate={overlay ? { y: 0, opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={overlay ? { y: '100%', opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className={cn(
              'overflow-hidden bg-black/60 backdrop-blur-2xl border-white/10',
              overlay
                ? 'absolute z-30 inset-x-0 bottom-0 max-h-[70%] overflow-y-auto overscroll-contain border-t rounded-t-2xl'
                : 'mt-2 border rounded-2xl',
            )}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 text-white text-sm font-medium">
                <ShoppingBag className="w-4 h-4" />
                {t('live.shop')}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 -mr-1.5 text-white/60 hover:text-white transition-colors"
                aria-label={t('live.closeShop')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 pb-4 space-y-1.5">
              {claimedListings > 0 && isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                </div>
              )}

              {sellable.map(product => (
                <ListingRow key={product.id} product={product} onBuy={() => setCheckout(product)} />
              ))}

              {linkRows.length > 0 && (
                <>
                  {sellable.length > 0 && <div className="h-px bg-white/10 my-2" />}
                  <p className="px-1 pb-1 text-[11px] leading-snug text-white/45">
                    {t('live.affiliateNotice')}
                  </p>
                  {linkRows.map((link, index) => (
                    <a
                      key={`${link.url}-${index}`}
                      href={link.url}
                      target="_blank"
                      rel="sponsored nofollow noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{link.label}</p>
                        <p className="text-[11px] text-white/40 truncate">{hostOf(link.url)}</p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-white/40 shrink-0" />
                    </a>
                  ))}
                </>
              )}

              {/* The count said there was something and nothing resolved — a
                  listing sold out, was de-listed, or came off the rail since
                  this post was published. Saying so beats an empty panel. */}
              {!isLoading && sellable.length === 0 && linkRows.length === 0 && (
                <p className="py-4 text-center text-xs text-white/40">
                  {t('live.nothingOnSale')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {checkout && (
        <StreamCheckoutDrawer
          tokenId={tokenId ?? null}
          product={checkout}
          open={!!checkout}
          onClose={() => setCheckout(null)}
        />
      )}
    </>
  );
}
