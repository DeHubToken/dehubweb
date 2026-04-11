/**
 * Store Detail Page
 * ==================
 * Shows a store's profile and all its active listings.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useStoreById, useStoreListings } from '@/hooks/use-stores';
import { StoreListingCard } from '@/components/app/stores/StoreListingCard';
import { ListingDetailDrawer } from '@/components/app/stores/ListingDetailDrawer';
import { Button } from '@/components/ui/button';

export default function StoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { data: store, isLoading: storeLoading } = useStoreById(storeId);
  const { data: listings = [], isLoading: listingsLoading } = useStoreListings(storeId);
  const [selectedListing, setSelectedListing] = useState<any>(null);

  if (storeLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-32 rounded-xl bg-white/5" />
        <div className="h-6 w-1/2 bg-white/10 rounded" />
        <div className="h-4 w-3/4 bg-white/5 rounded" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="p-4 text-center py-20">
        <p className="text-muted-foreground">Store not found</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="relative">
        {store.banner_url ? (
          <img src={store.banner_url} className="w-full aspect-[3/1] object-cover" alt="" />
        ) : (
          <div className="w-full aspect-[3/1] bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-full p-2"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Store info */}
      <div className="px-4 -mt-8 relative z-10">
        <div className="flex items-end gap-3">
          {store.avatar_url ? (
            <img src={store.avatar_url} className="w-16 h-16 rounded-full border-2 border-background object-cover" alt={store.name || ''} />
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-background bg-white/10 flex items-center justify-center text-xl font-bold text-primary-foreground">
              {(store.name || 'S')[0].toUpperCase()}
            </div>
          )}
          <div className="pb-1">
            <h1 className="text-lg font-bold text-primary-foreground">{store.name || 'Store'}</h1>
            <p className="text-xs text-muted-foreground">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
              Owner: {store.wallet_address?.slice(0, 6)}...{store.wallet_address?.slice(-4)}
            </p>
          </div>
        </div>
        {store.description && (
          <p className="mt-3 text-sm text-primary-foreground/80">{store.description}</p>
        )}
      </div>

      {/* Listings grid */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-primary-foreground mb-3">Listings</h2>
        {listingsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 animate-pulse">
                <div className="aspect-square bg-white/5" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-white/10 rounded w-3/4" />
                  <div className="h-3 bg-white/10 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground text-sm">No listings yet</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {listings.map((listing: any) => (
              <StoreListingCard
                key={listing.id}
                listing={listing}
                onClick={() => setSelectedListing(listing)}
              />
            ))}
          </div>
        )}
      </div>

      <ListingDetailDrawer
        listing={selectedListing}
        open={!!selectedListing}
        onClose={() => setSelectedListing(null)}
      />
    </div>
  );
}
