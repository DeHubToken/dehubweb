/**
 * Store Detail Page
 * ==================
 * Shows a store's profile and all its active listings.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useStoreById, useStoreListings, useStoreListing } from '@/hooks/use-stores';
import { StoreListingCard } from '@/components/app/stores/StoreListingCard';
import { ListingDetailDrawer } from '@/components/app/stores/ListingDetailDrawer';
import { Button } from '@/components/ui/button';

export default function StoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: store, isLoading: storeLoading } = useStoreById(storeId);
  const { data: listings = [], isLoading: listingsLoading } = useStoreListings(storeId);
  const [selectedListing, setSelectedListing] = useState<any>(null);

  // Open drawer when ?listing=<id> is present (e.g. from a shared post embed).
  const linkedListingId = searchParams.get('listing');
  const { data: linkedListing } = useStoreListing(linkedListingId || undefined);
  useEffect(() => {
    if (linkedListing && !selectedListing) setSelectedListing(linkedListing);
  }, [linkedListing, selectedListing]);

  const closeListing = () => {
    setSelectedListing(null);
    if (searchParams.get('listing')) {
      const next = new URLSearchParams(searchParams);
      next.delete('listing');
      setSearchParams(next, { replace: true });
    }
  };

  const storeInitial = (store?.name || 'S')[0].toUpperCase();

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
    <div className="pb-20 p-2 sm:p-3 space-y-6">
      <section className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] overflow-hidden relative">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 z-10 bg-black/50 backdrop-blur-sm rounded-full p-2"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        <div className="aspect-[3/1] w-full bg-zinc-900">
          {store.banner_url ? (
            <img src={store.banner_url} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
          )}
        </div>

        <div className="px-4 sm:px-6 pb-4">
          <div className="relative -mt-10 sm:-mt-12">
            {store.avatar_url ? (
              <img
                src={store.avatar_url}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-[10px] object-cover bg-zinc-900"
                alt={store.name || ''}
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[10px] bg-white/10 flex items-center justify-center text-xl sm:text-2xl font-bold text-primary-foreground">
                {storeInitial}
              </div>
            )}
          </div>

          <div className="mt-3">
            <h1 className="text-lg sm:text-xl font-bold text-primary-foreground">{store.name || 'Store'}</h1>
            <p className="text-xs text-muted-foreground">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
            {store.description && (
              <p className="mt-2 text-sm text-primary-foreground/80">{store.description}</p>
            )}
          </div>
        </div>
      </section>

      {/* Listings grid */}
      <div className="px-2 sm:px-1">
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
        onClose={closeListing}
      />
    </div>
  );
}
