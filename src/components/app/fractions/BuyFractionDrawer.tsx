/**
 * Buy Fraction Drawer
 * ===================
 * Buy part or all of a listing.
 *
 * Two things changed from the version this replaces, and both were doing real
 * damage:
 *
 *   1. **It was buying the whole listing.** There was no quantity control at
 *      all — clicking Buy on a 900-fraction listing tried to send 900
 *      fractions' worth of DHB. Fractions exist so people can take a slice.
 *   2. **`DHB_TOKEN[chainId]` is undefined.** DHB_TOKEN is a single token
 *      object, not a per-chain map, so that lookup returned undefined and every
 *      purchase threw "DHB token not configured for this chain" before it sent
 *      anything. Buying has never actually worked. The token address now comes
 *      from the server quote.
 *
 * The amount is quoted server-side and the payment is verified server-side
 * before a trade row exists — nothing computed in this file is signed.
 */

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, ShoppingCart, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useFractionPurchase, type FractionQuote } from '@/hooks/use-fraction-checkout';
import { useSellerStats, TOTAL_FRACTIONS, type FractionListing } from '@/hooks/use-fraction-marketplace';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useAuth } from '@/contexts/AuthContext';
import { truncateAddress } from '@/lib/api/token-holders';
import { SellerTrustBadge } from './SellerTrustBadge';
import dehubCoin from '@/assets/dehub-coin.png';

interface BuyFractionDrawerProps {
  listing: FractionListing | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function BuyFractionDrawer({ listing, open, onOpenChange, onSuccess }: BuyFractionDrawerProps) {
  const { walletAddress, openLoginModal } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState<FractionQuote | null>(null);
  const { getQuote, buy } = useFractionPurchase();
  const { data: sellerStats } = useSellerStats(listing?.seller_address);
  const { data: prices } = useTokenPrices();
  const dhbUsd = prices?.DHB ?? 0;

  const available = listing ? listing.quantity - listing.filled_quantity : 0;

  useEffect(() => {
    if (!open) return;
    setQuantity(Math.min(available, Math.max(1, available)));
    setQuote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listing?.id]);

  // Re-quote whenever the quantity settles. The server is the only thing that
  // may decide the amount, so the button stays disabled until it has answered.
  useEffect(() => {
    if (!open || !listing || quantity < 1 || quantity > available) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getQuote
        .mutateAsync({ listingId: listing.id, quantity })
        .then(q => { if (!cancelled) setQuote(q); })
        .catch(err => { if (!cancelled) { setQuote(null); toast.error(err.message); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listing?.id, quantity, available]);

  if (!listing) return null;

  const isMine = walletAddress?.toLowerCase() === listing.seller_address.toLowerCase();
  const sharePct = (quantity / TOTAL_FRACTIONS) * 100;
  const displayTotal = quote?.dhbAmount ?? quantity * listing.price_per_fraction;

  const handleBuy = async () => {
    // Signed out is a normal state on this page — the quote is public so the
    // price is already on screen. Open the login modal rather than scolding
    // someone with a toast for not being logged in yet.
    if (!walletAddress) {
      openLoginModal();
      return;
    }
    if (!quote) return;
    try {
      await buy.mutateAsync(quote);
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // useFractionPurchase already surfaces the server's message.
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-white text-lg">
            {listing.post_title || `Post #${listing.token_id}`}
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-5">
          {/* Quantity */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="text-sm text-white/60">How many</label>
              <span className="text-xs text-white/40">{available} available</span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[quantity]}
                min={1}
                max={Math.max(1, available)}
                step={1}
                onValueChange={([v]) => setQuantity(v)}
                disabled={isMine || available === 0}
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                max={available}
                value={quantity || ''}
                onChange={(e) =>
                  setQuantity(Math.min(available, Math.max(1, parseInt(e.target.value) || 1)))
                }
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-center outline-none focus:border-white/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Seller</span>
              <span className="text-white font-mono text-xs flex items-center gap-2">
                {truncateAddress(listing.seller_address)}
                <SellerTrustBadge stats={sellerStats} compact />
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Price per fraction</span>
              <span className="text-white">
                {listing.price_per_fraction.toLocaleString(undefined, { maximumFractionDigits: 4 })} DHB
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Share of the post</span>
              <span className="text-white">{sharePct.toFixed(1)}%</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between items-center">
              <span className="text-white font-medium">Total</span>
              <span className="text-white font-bold flex items-center gap-1.5">
                {getQuote.isPending && !quote ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                ) : (
                  <>
                    <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                    {displayTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB
                  </>
                )}
              </span>
            </div>
            {dhbUsd > 0 && (
              <p className="text-[11px] text-white/40 text-right -mt-1">
                ≈ ${(displayTotal * dhbUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Settlement — say plainly what happens next, because the fractions
              do not arrive in the same transaction as the payment. */}
          <div className="flex items-start gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
            <Info className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
            <p className="text-xs text-white/50">
              Your DHB goes straight to the seller and we verify it on-chain. The seller then has{' '}
              {quote?.settleWindowHours ?? 24} hours to send the fractions — you'll see the trade
              in your portfolio until they do, and their record is public.
            </p>
          </div>

          {quote?.paymentsFrozen && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/80">
                DHB transfers are paused right now, so this payment would revert. Try again once
                trading resumes.
              </p>
            </div>
          )}

          {quote && quote.sellerBalance !== null && quote.sellerBalance < quantity && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/80">
                The seller only holds {quote.sellerBalance} fractions right now — lower the
                quantity or pick another listing.
              </p>
            </div>
          )}

          <Button
            onClick={handleBuy}
            disabled={
              isMine ||
              !quote ||
              buy.isPending ||
              quote.paymentsFrozen ||
              available === 0
            }
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40"
          >
            {buy.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Paying…</>
            ) : isMine ? (
              'This is your own listing'
            ) : !walletAddress ? (
              'Sign in to buy'
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Buy {quantity} for {displayTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB
              </>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
