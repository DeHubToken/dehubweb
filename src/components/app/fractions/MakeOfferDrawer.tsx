/**
 * Make Offer Drawer
 * =================
 * Submit a buy offer for fractions on a post.
 */

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Loader2, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateOffer } from '@/hooks/use-fraction-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import dehubCoin from '@/assets/dehub-coin.png';

interface MakeOfferDrawerProps {
  tokenId: string;
  chainId?: number;
  targetSeller?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function MakeOfferDrawer({ tokenId, chainId, targetSeller, open, onOpenChange, onSuccess }: MakeOfferDrawerProps) {
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { walletAddress } = useAuth();
  const createOffer = useCreateOffer();

  const qty = parseInt(quantity) || 0;
  const prc = parseFloat(price) || 0;
  const total = qty * prc;
  const isValid = qty > 0 && prc > 0;

  const handleSubmit = async () => {
    if (!walletAddress) {
      toast.error('Please sign in first');
      return;
    }
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      await createOffer.mutateAsync({
        tokenId,
        quantity: qty,
        pricePerFraction: prc,
        targetSeller,
        chainId,
      });
      toast.success(`Offer submitted for ${qty} fraction${qty > 1 ? 's' : ''} at ${prc} DHB each`);
      onOpenChange(false);
      setQuantity('');
      setPrice('');
      onSuccess?.();
    } catch (err: any) {
      console.error('Make offer error:', err);
      toast.error(err?.message || 'Failed to submit offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-white text-lg">Make an Offer</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4">
          {/* Quantity */}
          <div>
            <label className="text-sm text-white/60 mb-1.5 block">Number of Fractions</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          {/* Price per fraction */}
          <div>
            <label className="text-sm text-white/60 mb-1.5 block">Your Offer (DHB per Fraction)</label>
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
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">DHB</span>
            </div>
          </div>

          {/* Summary */}
          {qty > 0 && prc > 0 && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Total offer value</span>
                <span className="text-white font-medium flex items-center gap-1.5">
                  <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
                  {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-white/40 text-center">
            Your offer will be visible to all holders. They can accept or reject it.
          </p>

          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
            ) : (
              <><HandCoins className="w-4 h-4 mr-2" />Submit Offer</>
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
