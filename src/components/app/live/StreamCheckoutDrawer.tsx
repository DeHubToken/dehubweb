/**
 * Stream Checkout Drawer
 * ======================
 * Buying without leaving the stream.
 *
 * The quote is fetched from the server when the drawer opens and is the only
 * price shown — the browser never divides a USD price by a token price to get
 * an amount. That division is what makes the marketplace drawer send 0 DHB when
 * the price feed hiccups; here a missing price is a 503 and the drawer says so
 * instead of quietly offering the item for nothing.
 */

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShippingAddressForm } from '@/components/app/stores/ShippingAddressForm';
import { Loader2, ShoppingCart, ImageIcon, Truck, AlertTriangle, PauseCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveCheckout, type StreamProduct, type LiveQuote } from '@/hooks/use-stream-shopping';
import { GLASS_STYLES } from '@/constants/app.constants';
import dehubCoin from '@/assets/dehub-coin.png';

interface Props {
  tokenId: string | null;
  product: StreamProduct;
  open: boolean;
  onClose: () => void;
}

export function StreamCheckoutDrawer({ tokenId, product, open, onClose }: Props) {
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { getQuote, buy } = useLiveCheckout(tokenId);
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');

  const listing = product.store_listings;
  const image = listing?.images?.[0];
  const isSelf = walletAddress?.toLowerCase() === listing?.wallet_address?.toLowerCase();

  // Re-quote every time the drawer opens. A stream can run for hours and the
  // host can re-price or sell out mid-broadcast, so a quote from the last time
  // this drawer was open is not one to charge against.
  useEffect(() => {
    if (!open || !tokenId || !listing) return;
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    getQuote
      .mutateAsync(listing.id)
      .then(q => { if (!cancelled) setQuote(q); })
      .catch((err: Error) => { if (!cancelled) setQuoteError(err.message); });
    return () => { cancelled = true; };
    // getQuote is a fresh mutation object each render; keying on the ids is
    // what stops this from re-firing forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tokenId, listing?.id]);

  const needsShipping = listing ? !listing.is_digital : false;
  const canBuy =
    !!quote &&
    !quote.paymentsFrozen &&
    !isSelf &&
    (!needsShipping || shippingAddress.trim().length > 0) &&
    !buy.isPending;

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
      // useLiveCheckout toasts the reason; the drawer stays open so the buyer
      // can read it and retry without losing the shipping address they typed.
    }
  };

  if (!listing) return null;

  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent className={GLASS_STYLES.drawer}>
        <DrawerHeader>
          <DrawerTitle className="truncate">{listing.title}</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="flex gap-3">
            <div className="w-20 h-20 rounded-xl bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
              {image ? (
                <img src={image} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-6 h-6 text-zinc-600" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {quote ? (
                <>
                  <div className="flex items-center gap-1.5 text-xl font-bold text-white">
                    <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
                    {quote.dhbAmount.toLocaleString()}
                  </div>
                  <p className="text-xs text-zinc-500">
                    ${quote.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </p>
                </>
              ) : quoteError ? (
                <p className="text-sm text-red-400">{quoteError}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Getting price…
                </div>
              )}

              {product.live_price != null && product.live_price < Number(listing.price) && (
                <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide bg-white text-black px-1.5 py-0.5 rounded">
                  Live price
                </span>
              )}
            </div>
          </div>

          {listing.description && (
            <p className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-4">{listing.description}</p>
          )}

          {needsShipping && listing.shipping_info && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Truck className="w-3.5 h-3.5" />
              {listing.shipping_info}
            </div>
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
                  Buying is unavailable until trading resumes. Nothing has been charged.
                </p>
              </div>
            </div>
          )}

          {isSelf && (
            <div className="flex gap-2.5 p-3 rounded-xl border border-white/10 bg-white/5">
              <AlertTriangle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-400">This is your own listing.</p>
            </div>
          )}

          {!isSelf && quote && !quote.paymentsFrozen && (
            <>
              {needsShipping && <ShippingAddressForm onChange={setShippingAddress} />}
              <div>
                <Label>Note to seller (optional)</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Size, colour, anything else…"
                  className="bg-white/5 border-white/10"
                />
              </div>
            </>
          )}

          <Button onClick={handleBuy} disabled={!canBuy} className="w-full">
            {buy.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Confirming payment…</>
            ) : (
              <><ShoppingCart className="w-4 h-4 mr-2" /> Buy now</>
            )}
          </Button>

          {buy.isPending && (
            <p className="text-[11px] text-center text-zinc-500">
              Don't close this — the order is written once the transfer is confirmed on Base.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
