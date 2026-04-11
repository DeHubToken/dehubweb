/**
 * Listing Detail Drawer
 * =====================
 * Shows full listing details with Buy Now flow.
 */

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useTokenPrices } from '@/hooks/use-token-prices';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ShoppingCart, MessageSquare, Loader2, ChevronLeft, ChevronRight, Package, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateOrder } from '@/hooks/use-stores';
import { sendERC20Token } from '@/lib/wallet/send';
import { DHB_TOKEN, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { GLASS_STYLES } from '@/constants/app.constants';

interface Props {
  listing: any;
  open: boolean;
  onClose: () => void;
}

export function ListingDetailDrawer({ listing, open, onClose }: Props) {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const createOrder = useCreateOrder();
  const navigate = useNavigate();
  const [buying, setBuying] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const { data: prices } = useTokenPrices();
  const dhbPrice = prices?.DHB ?? 0;
  if (!listing) return null;

  const images = (listing.images as string[]) || [];
  const sellerAddress = listing.wallet_address || listing.stores?.wallet_address;
  const isSelf = walletAddress?.toLowerCase() === sellerAddress?.toLowerCase();
  const soldOut = listing.stock_quantity === 0;
  const priceUsd = Number(listing.price);
  const priceDhb = dhbPrice > 0 ? priceUsd / dhbPrice : 0;
  const priceDhbCeil = Math.ceil(priceDhb);

  const handleBuy = async () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (isSelf) { toast.error("You can't buy your own listing"); return; }
    if (soldOut) { toast.error('This item is sold out'); return; }
    if (!listing.is_digital && !shippingAddress.trim()) { toast.error('Please enter a shipping address'); return; }

    setBuying(true);
    try {
      const dhbConfig = DHB_TOKEN[BASE_CHAIN_ID];
      if (!dhbConfig) throw new Error('DHB not configured');

      toast.loading('Sending DHB payment...');
      const result = await sendERC20Token(
        dhbConfig.address,
        sellerAddress,
        String(priceDhbCeil),
        18,
        BASE_CHAIN_ID as any
      );

      if (!result?.hash) throw new Error('Transaction failed');

      await createOrder.mutateAsync({
        listing_id: listing.id,
        seller_address: sellerAddress.toLowerCase(),
        amount: priceUsd,
        tx_hash: result.hash,
        shipping_address: shippingAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      toast.dismiss();
      onClose();
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || 'Purchase failed');
    } finally {
      setBuying(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent className={GLASS_STYLES.drawer}>
        <DrawerHeader>
          <DrawerTitle className="truncate">{listing.title}</DrawerTitle>
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
              <span className="text-xl font-bold flex items-center gap-1.5 text-primary-foreground">
                {dhbPrice > 0 ? (<><img src={dehubCoin} alt="DHB" className="w-5 h-5" />{priceDhbCeil.toLocaleString()}</>) : `$${priceUsd.toLocaleString()}`}
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
            onClick={() => { onClose(); navigate(`/${listing.stores?.wallet_address || sellerAddress}`); }}
            className="flex items-center gap-2 text-sm transition-colors text-primary-foreground"
          >
            {listing.stores?.avatar_url ? (
              <img src={listing.stores.avatar_url} className="w-6 h-6 rounded-full" alt="" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/10" />
            )}
            {listing.stores?.name || 'Store'}
          </button>

          {/* Buy form */}
          {!isSelf && !soldOut && (
            <>
              {!listing.is_digital && (
                <div>
                  <Label>Shipping Address</Label>
                  <Textarea value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} placeholder="Your shipping address..." className="bg-white/5 border-white/10 min-h-[60px]" />
                </div>
              )}
              <div>
                <Label>Note to seller (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special requests..." className="bg-white/5 border-white/10" />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!isSelf && (
              <Button onClick={handleBuy} disabled={buying || soldOut} className="flex-1">
                {buying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                {soldOut ? 'Sold Out' : 'Buy Now'}
              </Button>
            )}
            <Button variant="outline" onClick={() => { onClose(); navigate(`/app/messages`); }} className="flex-1">
              <MessageSquare className="w-4 h-4 mr-2" />
              Message Seller
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
