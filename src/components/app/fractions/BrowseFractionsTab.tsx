/**
 * Browse Fractions
 * ================
 * Every open listing across every post — the thing this market did not have.
 *
 * Fractions were only tradeable from `/app/post/:id/info`, a page you reach by
 * opening a post and pressing an info button, so the only way to buy into a
 * post was to already know which one you wanted. A market needs a front door.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DhbCoin } from '@/components/app/DhbAmount';
import { Search, Tag, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useMarketListings, useSellerStatsBatch, type MarketSort, type FractionListing } from '@/hooks/use-fraction-marketplace';
import { useAuth } from '@/contexts/AuthContext';
import { FractionListingCard } from './FractionListingCard';
import { BuyFractionDrawer } from './BuyFractionDrawer';

const SORTS: { value: MarketSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'fractions.sortNewest' },
  { value: 'price_asc', labelKey: 'fractions.sortCheapest' },
  { value: 'price_desc', labelKey: 'fractions.sortPriciest' },
  { value: 'quantity_desc', labelKey: 'fractions.sortBiggestStake' },
];

export function BrowseFractionsTab() {
  const { t } = useTranslation();
  const [sort, setSort] = useState<MarketSort>('newest');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FractionListing | null>(null);
  const { walletAddress } = useAuth();

  const { data: listings = [], isLoading } = useMarketListings(sort, search);
  const { data: sellerStats = {} } = useSellerStatsBatch(listings.map(l => l.seller_address));

  const mine = walletAddress?.toLowerCase();

  // Cheapest ask on the whole board — the one number that tells you whether
  // fractions are currently worth anything at all.
  const floor = useMemo(() => {
    if (!listings.length) return null;
    return Math.min(...listings.map(l => l.price_per_fraction));
  }, [listings]);

  return (
    <div className="space-y-4">
      <BuyFractionDrawer
        listing={selected}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />

      {/* Search + sort */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('fractions.searchPlaceholder')}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {SORTS.map((s) => (
            <LiquidGlassBubble2
              key={s.value}
              label={t(s.labelKey)}
              onClick={() => setSort(s.value)}
              width="auto"
              height="34px"
              active={sort === s.value}
              className={sort === s.value ? undefined : 'opacity-60'}
            />
          ))}
        </div>
      </div>

      {floor !== null && (
        <p className="text-xs text-white/40">
          {t('fractions.listingsFloor', { count: listings.length })}{' '}
          <span className="text-white/70">{floor.toLocaleString(undefined, { maximumFractionDigits: 4 })} <DhbCoin /></span>{' '}
          {t('fractions.perFraction')}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16">
          <Tag className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">
            {t(search ? 'fractions.noSearchMatch' : 'fractions.noneForSale')}
          </p>
          {!search && (
            <p className="text-white/25 text-xs mt-1">
              {t('fractions.startTheMarketHint')}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {listings.map((listing) => (
            <FractionListingCard
              key={listing.id}
              listing={listing}
              stats={sellerStats[listing.seller_address.toLowerCase()]}
              isMine={listing.seller_address.toLowerCase() === mine}
              onClick={() => setSelected(listing)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
