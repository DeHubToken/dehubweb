/**
 * Store Listing Card
 * ===================
 * Grid card for a single listing in the browse view.
 */

import { memo } from 'react';
import { ImageIcon } from 'lucide-react';

interface StoreListingCardProps {
  listing: any;
  onClick: () => void;
}

export const StoreListingCard = memo(function StoreListingCard({ listing, onClick }: StoreListingCardProps) {
  const images = (listing.images as string[]) || [];
  const firstImage = images[0];
  const storeName = listing.stores?.name || 'Unknown Store';

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden hover:border-white/20 transition-colors group"
    >
      {/* Image */}
      <div className="aspect-square bg-white/5 relative overflow-hidden">
        {firstImage ? (
          <img src={firstImage} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        {listing.is_digital && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-primary/80 text-primary-foreground px-1.5 py-0.5 rounded">Digital</span>
        )}
        {listing.stock_quantity === 0 && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-xs font-bold text-white/80">SOLD OUT</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium text-foreground truncate">{listing.title}</h3>
        <p className="text-xs text-muted-foreground truncate">{storeName}</p>
        <p className="text-sm font-semibold text-primary">{Number(listing.price).toLocaleString()} DHB</p>
      </div>
    </button>
  );
});
