/**
 * Buy Fraction Drawer
 * ===================
 * Confirms purchase of fractions from a listing.
 * Flow: Buyer sends DHB to seller → trade recorded in DB.
 */

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { sendERC20Token } from '@/lib/wallet/send';
import { DHB_TOKEN, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { useRecordTrade } from '@/hooks/use-fraction-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import type { FractionListing } from '@/hooks/use-fraction-marketplace';
import dehubCoin from '@/assets/dehub-coin.png';
import type { ChainId } from '@/components/app/ChainSelector';

interface BuyFractionDrawerProps {
  listing: FractionListing | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function BuyFractionDrawer({ listing, open, onOpenChange, onSuccess }: BuyFractionDrawerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { walletAddress } = useAuth();
  const recordTrade = useRecordTrade();

  if (!listing) return null;

  const availableQty = listing.quantity - listing.filled_quantity;
  const totalDHB = availableQty * listing.price_per_fraction;

  const handleBuy = async () => {
    if (!walletAddress) {
      toast.error('Please sign in first');
      return;
    }
    if (walletAddress.toLowerCase() === listing.seller_address.toLowerCase()) {
      toast.error("You can't buy your own listing");
      return;
    }

    setIsProcessing(true);
    try {
      // Step 1: Send DHB to seller
      toast.info('Sending DHB payment to seller...');
      const chainId = (listing.chain_id || BASE_CHAIN_ID) as ChainId;
      const dhbConfig = DHB_TOKEN[chainId];
      if (!dhbConfig) throw new Error('DHB token not configured for this chain');

      const result = await sendERC20Token(
        dhbConfig.address,
        listing.seller_address,
        totalDHB.toString(),
        dhbConfig.decimals,
        chainId
      );

      toast.info('Waiting for confirmation...');
      const receipt = await result.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Transaction failed');
      }

      // Step 2: Record trade in DB
      await recordTrade.mutateAsync({
        tokenId: listing.token_id,
        sellerAddress: listing.seller_address,
        buyerAddress: walletAddress,
        quantity: availableQty,
        pricePerFraction: listing.price_per_fraction,
        txHash: receipt.hash,
        listingId: listing.id,
        chainId: listing.chain_id,
      });

      toast.success(`Purchased ${availableQty} fraction${availableQty > 1 ? 's' : ''}! Seller will transfer fractions.`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Buy fraction error:', err);
      toast.error(err?.message || 'Failed to purchase fractions');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-white text-lg">Buy Fractions</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Post</span>
              <span className="text-white font-medium">#{listing.token_id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Seller</span>
              <span className="text-white font-mono text-xs">
                {listing.seller_address.slice(0, 6)}...{listing.seller_address.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Quantity</span>
              <span className="text-white font-medium">{availableQty} fractions</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Price per fraction</span>
              <span className="text-white font-medium">{listing.price_per_fraction} DHB</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between">
              <span className="text-white font-medium">Total</span>
              <span className="text-white font-bold flex items-center gap-1.5">
                <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                {totalDHB.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB
              </span>
            </div>
          </div>

          <p className="text-xs text-white/40 text-center">
            DHB will be sent directly to the seller. The seller will then transfer the fractions to you.
          </p>

          <Button
            onClick={handleBuy}
            disabled={isProcessing}
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40"
          >
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
            ) : (
              <><ShoppingCart className="w-4 h-4 mr-2" />Buy for {totalDHB.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB</>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
