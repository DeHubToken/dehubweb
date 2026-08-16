/**
 * Listing Detail Drawer
 * =====================
 * Shows full listing details with Buy Now flow.
 *
 * The price the buyer pays is quoted by the server when this drawer opens, and
 * is the only price it will charge against. It used to be computed here, as
 * `priceUsd / prices.DHB` — and `useTokenPrices` reports DHB as 0 both before
 * its first fetch and after a failed one, so a hiccup in get-dhb-price made the
 * amount 0, sent ZERO DHB, and still wrote an order marked paid with the seller
 * notified. Now a missing price is a 503 that this drawer shows instead of a
 * free item, and the order row is written by the server after it has read the
 * transfer back off Base.
 */

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShippingAddressForm } from './ShippingAddressForm';
import { ShoppingCart, MessageSquare, Loader2, ChevronLeft, ChevronRight, Package, Truck, Share2, PauseCircle, CreditCard } from 'lucide-react';
import { ShareEntityDrawer } from '@/components/app/ShareEntityDrawer';
import { dehubLinkFor } from '@/lib/dehub-links';
import { useAuth } from '@/contexts/AuthContext';
import {
  useProductCheckout, useCardCheckout,
  type ProductQuote, type CardQuote,
} from '@/hooks/use-product-checkout';
import { useNavigate } from 'react-router-dom';
import { GLASS_STYLES } from '@/constants/app.constants';
import { ReviewSection } from './ReviewSection';

interface Props {
  listing: any;
  open: boolean;
  onClose: () => void;
}

export function ListingDetailDrawer({ listing, open, onClose }: Props) {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  // No stream attached: same quote → pay → verify path the live rail uses.
  const { getQuote, buy } = useProductCheckout(null);
  const { getCardQuote, payByCard } = useCardCheckout(null);
  const navigate = useNavigate();
  const [quote, setQuote] = useState<ProductQuote | null>(null);
  const [cardQuote, setCardQuote] = useState<CardQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const sellerAddress = listing?.wallet_address || listing?.stores?.wallet_address;
  const isSelf = !!walletAddress && walletAddress.toLowerCase() === sellerAddress?.toLowerCase();
  const soldOut = listing?.stock_quantity === 0;
  const listingId = listing?.id as string | undefined;
  // Quoting needs a DeHub token, so a signed-out browser would only get a 401
  // back. They see the USD price and Buy opens the login modal; the quote
  // fetches on its own once they are in, because this flips with it.
  const canQuote = open && !!listingId && isAuthenticated && !isSelf && !soldOut;

  // Re-quote on every open. A listing can sit in the grid for days and the peg
  // moves, so a quote from the last time this drawer was open is not one to
  // charge against. Skipped for the seller's own listing, which cannot be
  // bought — the server would answer 400 and the drawer would show it as an
  // error under a price the viewer was never going to pay.
  useEffect(() => {
    if (!canQuote) return;
    let cancelled = false;
    setQuote(null);
    setCardQuote(null);
    setQuoteError(null);
    getQuote
      .mutateAsync(listingId!)
      .then(q => { if (!cancelled) setQuote(q); })
      .catch((err: Error) => { if (!cancelled) setQuoteError(err.message); });
    // Quoted alongside, never instead: card can be unavailable while DHB is
    // fine, and a failure here must not take the crypto button down with it.
    getCardQuote
      .mutateAsync(listingId!)
      .then(q => { if (!cancelled) setCardQuote(q); })
      .catch(() => { if (!cancelled) setCardQuote(null); });
    return () => { cancelled = true; };
    // getQuote is a fresh mutation object each render; keying on the listing is
    // what stops this from re-firing forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuote, listingId]);

  if (!listing) return null;

  const images = (listing.images as string[]) || [];
  const priceUsd = Number(listing.price);
  const needsShipping = !listing.is_digital;
  // Signed out, Buy is live purely to open the login modal — there is nothing
  // to charge yet. Signed in, it needs a server quote behind it.
  const hasShipping = !needsShipping || shippingAddress.trim().length > 0;
  const canBuy = !isSelf && !soldOut && (
    !isAuthenticated || (
      !!quote &&
      !quote.paymentsFrozen &&
      hasShipping &&
      !buy.isPending
    )
  );

  // Independent of DHB's pause — card is the rail that still works while the
  // token is frozen, so it must not share a gate with it.
  const cardAvailable = !!cardQuote?.available && !isSelf && !soldOut;
  const canPayByCard = cardAvailable && hasShipping && !payByCard.isPending;

  const handleCard = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!listingId) return;
    payByCard.mutate({
      listingId,
      shippingAddress: shippingAddress.trim(),
      notes: notes.trim() || undefined,
    });
  };

  const handleBuy = async () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (!quote) return;
    try {
      await buy.mutateAsync({
        quote,
        shippingAddress: shippingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch {
      // useProductCheckout toasts the reason; the drawer stays open so the
      // buyer can read it and retry without retyping their shipping address.
    }
  };

  return (
    <>
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent className={GLASS_STYLES.drawer}>
        <DrawerHeader className="flex flex-row items-center justify-between gap-3">
          <DrawerTitle className="truncate">{listing.title}</DrawerTitle>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Share item"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Image carousel */}
          {images.length > 0 && (
            <div className="relative aspect-square rounded-xl overflow-hidden bg-white/5 max-h-[40vh]">
              <img src={images[imgIdx]} alt={listing.title} className="w-full h-full object-cover" />
              {images.length > 1 && (
                <>
                  <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 rounded-full p-1">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setImgIdx(i => (i + 1) % images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 rounded-full p-1">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Price & meta */}
          <div className="flex items-center justify-between">
            <div>
              {/* The DHB figure only ever comes from the server's quote. While
                  it is loading, or if pricing is down, the listing shows its
                  USD price — which is a display value and not something the
                  wallet can be asked to send. */}
              <span className="text-xl font-bold flex items-center gap-1.5 text-primary-foreground">
                {quote ? (<><img src={dehubCoin} alt="DHB" className="w-5 h-5" />{quote.dhbAmount.toLocaleString()}</>) : `$${priceUsd.toLocaleString()}`}
              </span>
              <p className="text-xs text-zinc-500">${priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</p>
            </div>
            <div className="flex gap-2">
              {listing.is_digital && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">Digital</span>}
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded capitalize text-primary-foreground">{listing.condition}</span>
              <span className="text-xs bg-white/10 px-2 py-0.5 rounded capitalize text-primary-foreground">{listing.category}</span>
            </div>
          </div>

          {/* Description */}
          {listing.description && (
            <p className="text-sm whitespace-pre-wrap text-primary-foreground">{listing.description}</p>
          )}

          {/* Stock */}
          <div className="flex items-center gap-2 text-xs text-primary-foreground">
            <Package className="w-3.5 h-3.5" />
            {listing.stock_quantity === null ? 'Unlimited stock' : listing.stock_quantity === 0 ? 'Sold out' : `${listing.stock_quantity} available`}
          </div>

          {/* Shipping */}
          {!listing.is_digital && listing.shipping_info && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Truck className="w-3.5 h-3.5" />
              {listing.shipping_info}
            </div>
          )}

          {/* Seller */}
          <button
            onClick={() => { onClose(); navigate(`/app/stores/${listing.store_id}`); }}
            className="flex items-center gap-2 text-sm transition-colors text-primary-foreground"
          >
            {listing.stores?.avatar_url ? (
              <img src={listing.stores.avatar_url} className="w-6 h-6 rounded object-cover" alt="" />
            ) : (
              <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                {(listing.stores?.name || 'S')[0].toUpperCase()}
              </div>
            )}
            {listing.stores?.name || 'Store'}
          </button>

          {/* Reviews */}
          <ReviewSection listingId={listing.id} sellerAddress={sellerAddress} />

          {/* Pricing state. A quote that never arrives is the case this whole
              path exists for: no quote means no purchase, rather than a
              purchase for nothing. */}
          {isAuthenticated && !isSelf && !soldOut && !quote && (
            quoteError ? (
              <p className="text-sm text-red-400">{quoteError}</p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Getting price…
              </div>
            )
          )}

          {/* DHB is ERC20Pausable and paused right now. Saying so beats letting
              the wallet open, charge gas, and revert. Recomputed per quote, so
              this disappears on its own once the token is unpaused. */}
          {quote?.paymentsFrozen && (
            <div className="flex gap-2.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
              <PauseCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/90">
                <p className="font-semibold text-amber-300">DHB transfers are paused</p>
                <p className="mt-0.5">
                  {cardAvailable
                    ? 'Pay by card below — nothing has been charged.'
                    : 'Buying is unavailable until trading resumes. Nothing has been charged.'}
                </p>
              </div>
            </div>
          )}

          {/* Buy form — shown when EITHER rail can take the money. Gating it on
              the DHB quote alone hid the address field while card was the only
              working option. */}
          {!isSelf && !soldOut && ((quote && !quote.paymentsFrozen) || cardAvailable) && (
            <>
              {needsShipping && (
                <ShippingAddressForm onChange={setShippingAddress} />
              )}
              <div>
                <Label>Note to seller (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requests..." className="bg-white/5 border-white/10" />
              </div>
            </>
          )}

          {/* Card. Rendered only when the server says it is offerable — for a
              digital good or a seller with no payout account the button is
              absent rather than disabled with an unactionable explanation. */}
          {cardAvailable && (
            <Button onClick={handleCard} disabled={!canPayByCard} className="w-full">
              {payByCard.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <CreditCard className="w-4 h-4 mr-2" />}
              {payByCard.isPending ? 'Opening checkout…' : `Pay by card · $${priceUsd.toFixed(2)}`}
            </Button>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!isSelf && (
              <Button
                onClick={handleBuy}
                disabled={!canBuy}
                variant={cardAvailable ? 'outline' : 'default'}
                className="flex-1"
              >
                {buy.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                {soldOut ? 'Sold Out' : buy.isPending ? 'Confirming payment…' : cardAvailable ? 'Pay with DHB' : 'Buy Now'}
              </Button>
            )}
            {/* '/app/messages' has no child route — the peer is handed over in
                navigation state, the same way every other "message this user"
                entry point does it. A path segment here 404s. */}
            <Button variant="outline" onClick={() => { onClose(); navigate('/app/messages', { state: { openDmWith: sellerAddress } }); }} className="flex-1">
              <MessageSquare className="w-4 h-4 mr-2" />
              Message Seller
            </Button>
          </div>

          {buy.isPending && (
            <p className="text-[11px] text-center text-zinc-500">
              Don't close this — the order is written once the transfer is confirmed on Base.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>

    {/* Sibling, not a child: a Drawer nested inside another Drawer's root is
        how the "DialogPortal must be used within Dialog" crash gets in. */}
    <ShareEntityDrawer
      open={shareOpen}
      onOpenChange={setShareOpen}
      url={dehubLinkFor.listing(listing.store_id, listing.id)}
      shareTitle={listing.title}
    />
    </>
  );
}
