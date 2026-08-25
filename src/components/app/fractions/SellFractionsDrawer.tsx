/**
 * Sell Fractions Drawer
 * =====================
 * List some of your fractions of a post at a fixed price.
 *
 * The quantity cap is read live off the collection contract rather than from
 * the holder list, and the server re-checks it against what you have already
 * listed and already owe before the row is written. Listing fractions you no
 * longer hold is the single fastest way to turn this market into a scam
 * report, so it is checked twice on purpose.
 */

import { useEffect, useMemo, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, Tag, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateListing, type PostSnapshot } from '@/hooks/use-fraction-checkout';
import { useFractionBalance } from '@/hooks/use-fraction-balance';
import { useFractionListings, TOTAL_FRACTIONS } from '@/hooks/use-fraction-marketplace';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { useAuth } from '@/contexts/AuthContext';
import dehubCoin from '@/assets/dehub-coin.png';

interface SellFractionsDrawerProps {
  tokenId: string;
  chainId?: number;
  post?: PostSnapshot;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function SellFractionsDrawer({
  tokenId,
  chainId = 8453,
  post,
  open,
  onOpenChange,
  onSuccess,
}: SellFractionsDrawerProps) {
  const { walletAddress } = useAuth();
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState('');
  const createListing = useCreateListing();

  const { data: balance, isLoading: loadingBalance } = useFractionBalance(tokenId, chainId);
  const { data: listings = [] } = useFractionListings(tokenId);
  const { data: prices } = useTokenPrices();
  const dhbUsd = prices?.DHB ?? 0;

  // What is already on the book under your address is not sellable again. The
  // server enforces this too — this is so the slider stops in the right place
  // rather than the request being refused after the fact.
  const alreadyListed = useMemo(
    () =>
      listings
        .filter(l => l.seller_address.toLowerCase() === walletAddress?.toLowerCase())
        .reduce((sum, l) => sum + (l.quantity - l.filled_quantity), 0),
    [listings, walletAddress],
  );

  const held = balance ?? 0;
  const sellable = Math.max(0, held - alreadyListed);

  // The cheapest ask on the book — the number a seller is actually pricing
  // against, and the closest thing this market has to a spot price.
  const floorPrice = useMemo(() => {
    const asks = listings
      .filter(l => l.quantity - l.filled_quantity > 0)
      .map(l => l.price_per_fraction);
    return asks.length ? Math.min(...asks) : null;
  }, [listings]);

  useEffect(() => {
    if (!open) return;
    // Default to a tenth of what you hold — a sensible first sale that does not
    // silently dump someone's whole position because they dragged too far.
    setQuantity(sellable > 0 ? Math.max(1, Math.floor(sellable / 10)) : 0);
    setPrice(floorPrice ? String(floorPrice) : '');
    // Only when the drawer opens; re-running on every balance tick would fight
    // the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const prc = parseFloat(price) || 0;
  const total = quantity * prc;
  const sharePct = (quantity / TOTAL_FRACTIONS) * 100;
  const isValid = quantity > 0 && quantity <= sellable && prc > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    try {
      await createListing.mutateAsync({
        tokenId,
        quantity,
        pricePerFraction: prc,
        chainId,
        post,
      });
      toast.success(`Listed ${quantity} fraction${quantity === 1 ? '' : 's'} at ${prc} DHB each`);
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // useCreateListing already surfaces the server's message.
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-white text-lg">Sell fractions</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-5">
          {loadingBalance ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
            </div>
          ) : balance === null ? (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/80">
                Couldn't read your fraction balance just now. Close this and try again — listing
                without it risks selling fractions you no longer hold.
              </p>
            </div>
          ) : sellable === 0 ? (
            <p className="text-sm text-white/50 text-center py-6">
              {held === 0
                ? "You don't hold any fractions of this post."
                : `All ${held} of your fractions are already listed.`}
            </p>
          ) : (
            <>
              {/* Quantity */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <label className="text-sm text-white/60">How many</label>
                  <span className="text-xs text-white/40">
                    {sellable} available
                    {alreadyListed > 0 && ` · ${alreadyListed} already listed`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[quantity]}
                    min={1}
                    max={sellable}
                    step={1}
                    onValueChange={([v]) => setQuantity(v)}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    max={sellable}
                    value={quantity || ''}
                    onChange={(e) =>
                      setQuantity(Math.min(sellable, Math.max(0, parseInt(e.target.value) || 0)))
                    }
                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-center outline-none focus:border-white/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className="flex gap-2">
                  {[0.25, 0.5, 1].map((f) => (
                    <button
                      key={f}
                      onClick={() => setQuantity(Math.max(1, Math.floor(sellable * f)))}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition-colors"
                    >
                      {f === 1 ? 'All' : `${f * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-sm text-white/60">Price per fraction</label>
                  {floorPrice !== null && (
                    <button
                      onClick={() => setPrice(String(floorPrice))}
                      className="text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      Match floor · {floorPrice} DHB
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-16 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                    DHB
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Share of the post</span>
                  <span className="text-white">{sharePct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                  <span className="text-white font-medium">You receive</span>
                  <span className="text-white font-bold flex items-center gap-1.5">
                    <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                    {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB
                  </span>
                </div>
                {dhbUsd > 0 && total > 0 && (
                  <p className="text-[11px] text-white/40 text-right">
                    ≈ ${(total * dhbUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              <p className="text-xs text-white/40 text-center">
                Listing is free. When someone buys, you'll be asked to send the fractions —
                you have 24 hours, and your delivery record is shown on every listing you make.
              </p>

              <Button
                onClick={handleSubmit}
                disabled={!isValid || createListing.isPending}
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40"
              >
                {createListing.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Listing…</>
                ) : (
                  <><Tag className="w-4 h-4 mr-2" />List {quantity} fraction{quantity === 1 ? '' : 's'}</>
                )}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
