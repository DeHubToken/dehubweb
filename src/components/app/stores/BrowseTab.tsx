/**
 * Browse Tab
 * ===========
 * Public marketplace grid with category filters, search, sort, and price range.
 */

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { useBrowseListings } from '@/hooks/use-stores';
import { StoreListingCard } from './StoreListingCard';
import { ListingDetailDrawer } from './ListingDetailDrawer';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'digital', label: 'Digital' },
  { value: 'merch', label: 'Merch' },
  { value: 'art', label: 'Art' },
  { value: 'service', label: 'Services' },
  { value: 'other', label: 'Other' },
];

const PRICE_PRESETS = [
  { label: 'Under $10', min: 0, max: 10 },
  { label: '$10 – $50', min: 10, max: 50 },
  { label: '$50 – $100', min: 50, max: 100 },
  { label: '$100 – $500', min: 100, max: 500 },
  { label: '$500+', min: 500, max: Infinity },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

export function BrowseTab() {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: listings = [], isLoading } = useBrowseListings(category, sort, search);

  const hasPriceFilter = minPrice !== '' || maxPrice !== '';
  const hasActiveFilters = hasPriceFilter || sort !== 'newest';

  const filteredListings = useMemo(() => {
    if (!hasPriceFilter) return listings;
    const min = minPrice !== '' ? Number(minPrice) : 0;
    const max = maxPrice !== '' ? Number(maxPrice) : Infinity;
    return listings.filter((l: any) => {
      const p = Number(l.price);
      return p >= min && p <= max;
    });
  }, [listings, minPrice, maxPrice, hasPriceFilter]);

  const applyPreset = (preset: typeof PRICE_PRESETS[0]) => {
    setMinPrice(String(preset.min));
    setMaxPrice(preset.max === Infinity ? '' : String(preset.max));
  };

  const clearPrice = () => {
    setMinPrice('');
    setMaxPrice('');
  };

  const clearAll = () => {
    clearPrice();
    setSort('newest');
  };

  const priceLabel = hasPriceFilter
    ? `$${minPrice || '0'}${maxPrice ? ` – $${maxPrice}` : '+'}`
    : null;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search listings..."
          className="pl-9 bg-black/60 backdrop-blur-2xl border-white/10 rounded-xl text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Category chips + filter button */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center">
        {CATEGORIES.map(c => (
          <LiquidGlassBubble
            key={c.value}
            shimmer
            noBorder
            onClick={() => setCategory(c.value)}
            className={`cursor-pointer flex-shrink-0 [&>div]:!rounded-xl [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl ${
              category === c.value ? '[&>div]:!ring-1 [&>div]:!ring-inset [&>div]:!ring-white/60' : 'opacity-60'
            }`}
            style={{ height: '32px', width: 'auto' }}
          >
            <span className="text-white text-xs font-medium px-3 whitespace-nowrap">
              {c.label}
            </span>
          </LiquidGlassBubble>
        ))}

        {/* Filter/Sort button */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <div className="flex-shrink-0">
              <LiquidGlassBubble
                shimmer
                noBorder
                onClick={() => setFilterOpen(!filterOpen)}
                className={`cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl ${
                  hasActiveFilters ? '[&>div]:!ring-1 [&>div]:!ring-inset [&>div]:!ring-white/60' : 'opacity-60'
                }`}
                style={{ height: '32px', width: 'auto' }}
              >
                <span className="flex items-center gap-1.5 text-white text-xs font-medium px-3 whitespace-nowrap">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {hasActiveFilters && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </span>
              </LiquidGlassBubble>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72 bg-black/80 backdrop-blur-2xl border-white/10 p-4 space-y-4" align="end">
            {/* Sort */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Sort By</p>
              <div className="flex flex-wrap gap-1.5">
                {SORT_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setSort(o.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      sort === o.value
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price range */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Price Range (USD)</p>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                      minPrice === String(p.min) && (p.max === Infinity ? maxPrice === '' : maxPrice === String(p.max))
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom inputs */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] text-zinc-400">Min</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minPrice}
                    onChange={e => setMinPrice(e.target.value)}
                    className="h-8 text-xs bg-white/5 border-white/10"
                  />
                </div>
                <span className="text-zinc-500 mt-4">–</span>
                <div className="flex-1">
                  <Label className="text-[10px] text-zinc-400">Max</Label>
                  <Input
                    type="number"
                    placeholder="Any"
                    value={maxPrice}
                    onChange={e => setMaxPrice(e.target.value)}
                    className="h-8 text-xs bg-white/5 border-white/10"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={clearAll} className="flex-1 text-xs h-7 text-muted-foreground">
                Reset
              </Button>
              <Button size="sm" onClick={() => setFilterOpen(false)} className="flex-1 text-xs h-7">
                Done
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {sort !== 'newest' && (
            <button
              onClick={() => setSort('newest')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white"
            >
              {SORT_OPTIONS.find(o => o.value === sort)?.label}
              <X className="w-3 h-3" />
            </button>
          )}
          {hasPriceFilter && (
            <button
              onClick={clearPrice}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white"
            >
              {priceLabel}
              <X className="w-3 h-3" />
            </button>
          )}
          <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-white transition-colors">
            Clear all
          </button>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 animate-pulse">
              <div className="aspect-square bg-white/5" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {hasPriceFilter ? 'No listings in this price range.' : 'No listings found. Be the first to sell something!'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredListings.map((listing: any) => (
            <StoreListingCard
              key={listing.id}
              listing={listing}
              onClick={() => setSelectedListing(listing)}
            />
          ))}
        </div>
      )}

      <ListingDetailDrawer
        listing={selectedListing}
        open={!!selectedListing}
        onClose={() => setSelectedListing(null)}
      />
    </div>
  );
}
