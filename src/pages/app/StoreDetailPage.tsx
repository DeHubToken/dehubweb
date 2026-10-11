import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Store Detail Page
 * ==================
 * Shows a store's profile and all its active listings.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Share2 } from 'lucide-react';
import { useStoreById, useStoreListings, useStoreListing } from '@/hooks/use-stores';
import { StoreListingCard } from '@/components/app/stores/StoreListingCard';
import { ListingDetailDrawer } from '@/components/app/stores/ListingDetailDrawer';
import { ShareEntityDrawer } from '@/components/app/ShareEntityDrawer';
import { dehubLinkFor } from '@/lib/dehub-links';
import { SEOHead } from '@/components/SEOHead';
import { IslandAction, KitButton, PageBody, PageEmpty, PageIsland } from '@/components/app/page-kit/PageKit';
import { storageImage, deviceWidth, isMdUp } from '@/lib/media-url';
import { AppState } from '@/components/app/AppState';

export default function StoreDetailPage() {
  const { t: _copy } = _useCopy();
  const { storeId } = useParams<{ storeId: string }>();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    data: store,
    isLoading: storeLoading,
    isError: storeFailed,
    isFetching: storeFetching,
    refetch: refetchStore,
  } = useStoreById(storeId);
  const { data: listings = [], isLoading: listingsLoading } = useStoreListings(storeId);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [shareOpen, setShareOpen] = useState(false);

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

  // useStoreById reads a missing store as null, so an error here is the read
  // failing -- not a deleted store.
  if (!store && storeFailed) {
    return (
      <div className="min-h-screen">
        <SEOHead title={_copy("copy.9a01cfe1592a", { defaultValue: "{{value1}} — DeHub Stores", value1: t('common.somethingWentWrong') })} description={t('common.somethingWentWrong')} noindex />
        <PageIsland back backFallback="/app/stores" icon="stores" title={t('stores.title')} />
        <PageBody>
        <div className="py-12">
        <AppState
          kind="error"
          icon="stores"
          title={t('common.somethingWentWrong')}
          primaryAction={{ label: t('common.retry'), onClick: () => void refetchStore(), loading: storeFetching }}
          secondaryAction={{ label: t('common.goBack'), onClick: () => navigate(-1) }}
        />
        </div>
        </PageBody>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen">
        <SEOHead title={_copy("copy.9a01cfe1592a", { defaultValue: "{{value1}} — DeHub Stores", value1: t('stores.storeNotFound') })} description={t('stores.storeNotFound')} noindex />
        <PageIsland back backFallback="/app/stores" icon="stores" title={t('stores.title')} />
        <PageBody>
          <PageEmpty
            icon="stores"
            title={t('stores.storeNotFound')}
            action={<KitButton variant="quiet" onClick={() => navigate(-1)}>{t('common.goBack')}</KitButton>}
          />
        </PageBody>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SEOHead title={_copy("copy.9a01cfe1592a", { defaultValue: "{{value1}} — DeHub Stores", value1: store.name })} description={(store.description || `Shop ${store.name} on DeHub. Peer-to-peer commerce paid in tokens or USDC.`).slice(0, 155)} url={`https://dehub.io/app/stores/${store.id}`} />
      <PageIsland
        back
        backFallback="/app/stores"
        icon="stores"
        title={store.name || t('stores.store')}
        subtitle={t('stores.listingCount', { count: listings.length })}
        actions={
          <IslandAction label={t('stores.shareStore')} onClick={() => setShareOpen(true)}>
            <Share2 className="h-[18px] w-[18px]" />
          </IslandAction>
        }
      />

      <PageBody>
      <section className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] overflow-hidden relative">
        <div className="aspect-[3/1] w-full bg-zinc-900">
          {store.banner_url ? (
            <img src={storageImage(store.banner_url, deviceWidth(isMdUp() ? 600 : 430))} className="w-full h-full object-cover" alt="" fetchPriority="high" />
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
            <h2 className="text-lg sm:text-xl font-bold text-primary-foreground">{store.name || t('stores.store')}</h2>
            <p className="text-xs text-muted-foreground">{t('stores.listingCount', { count: listings.length })}</p>
            {store.description && (
              <p className="mt-2 text-sm text-primary-foreground/80">{store.description}</p>
            )}
          </div>
        </div>
      </section>

      {/* Listings grid */}
      <div className="px-2 sm:px-1">
        <h2 className="text-sm font-semibold text-primary-foreground mb-3">{t('stores.listings')}</h2>
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
          <p className="text-center py-12 text-muted-foreground text-sm">{t('stores.noListingsYet')}</p>
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

      </PageBody>

      <ListingDetailDrawer
        listing={selectedListing}
        open={!!selectedListing}
        onClose={closeListing}
      />

      <ShareEntityDrawer
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={dehubLinkFor.store(store.id)}
        shareTitle={store.name || t('stores.store')}
      />
    </div>
  );
}
