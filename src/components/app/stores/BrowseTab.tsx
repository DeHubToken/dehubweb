/**
 * Browse Tab
 * ===========
 * Public marketplace grid with category filters, search, sort, and price range.
 */

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, DollarSign, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

export function BrowseTab() {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [priceOpen, setPriceOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const { data: listings = [], isLoading } = useBrowseListings(category, sort, search);

  const hasPriceFilter = minPrice !== '' || maxPrice !== '';

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
    setPriceOpen(false);
  };

  const clearPrice = () => {
    setMinPrice('');
    setMaxPrice('');
  };

  const priceLabel = hasPriceFilter
    ? `$${minPrice || '0'}${maxPrice ? ` – $${maxPrice}` : '+'}`
    : null;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="pl-9 bg-black/60 backdrop-blur-2xl border-white/10 rounded-xl text-white placeholder:text-zinc-500"
          />
        </div>

        {/* Price range */}
        <Popover open={priceOpen} onOpenChange={setPriceOpen}>
          <PopoverTrigger asChild>
            <div>
              <LiquidGlassBubble
                shimmer
                noBorder
                onClick={() => setPriceOpen(!priceOpen)}
                className={`cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl ${hasPriceFilter ? 'ring-1 ring-primary/50' : ''}`}
                style={{ height: '36px', width: 'auto' }}
              >
                <span className="flex items-center gap-1.5 text-white text-xs font-medium px-3">
                  <DollarSign className="w-3.5 h-3.5" />
                  {priceLabel || 'Price'}
                </span>
              </LiquidGlassBubble>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-64 bg-black/80 backdrop-blur-2xl border-white/10 p-3 space-y-3" align="end">
            <p className="text-xs font-semibold text-primary-foreground">Price Range (USD)</p>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {PRICE_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white/5 text-muted-foreground hover:bg-white/10 transition-colors"
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

            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={clearPrice} className="flex-1 text-xs h-7">
                Clear
              </Button>
              <Button size="sm" onClick={() => setPriceOpen(false)} className="flex-1 text-xs h-7">
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger asChild>
            <div>
              <LiquidGlassBubble
                shimmer
                noBorder
                onClick={() => setSortOpen(!sortOpen)}
                className="cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl"
                style={{ height: '36px', width: 'auto' }}
              >
                <span className="flex items-center gap-1.5 text-white text-xs font-medium px-3">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {sort === 'newest' ? 'Newest' : sort === 'price_asc' ? 'Price: Low→High' : 'Price: High→Low'}
                </span>
              </LiquidGlassBubble>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-40 bg-black/80 backdrop-blur-2xl border-white/10 p-1.5" align="end">
            {[
              { value: 'newest', label: 'Newest' },
              { value: 'price_asc', label: 'Price: Low→High' },
              { value: 'price_desc', label: 'Price: High→Low' },
            ].map(o => (
              <button
                key={o.value}
                onClick={() => { setSort(o.value); setSortOpen(false); }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === o.value ? 'bg-white/10 text-white' : 'text-muted-foreground hover:bg-white/5'}`}
              >
                {o.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Active price chip */}
      {hasPriceFilter && (
        <div className="flex items-center gap-2">
          <button
            onClick={clearPrice}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary"
          >
            {priceLabel}
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Category chips — liquid glass style */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map(c => (
          <LiquidGlassBubble
            key={c.value}
            shimmer
            noBorder
            onClick={() => setCategory(c.value)}
            className={`cursor-pointer flex-shrink-0 [&>div]:!rounded-xl [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl ${
              category === c.value ? 'ring-1 ring-primary/50' : 'opacity-60'
            }`}
            style={{ height: '32px', width: 'auto' }}
          >
            <span className="text-white text-xs font-medium px-3 whitespace-nowrap">
              {c.label}
            </span>
          </LiquidGlassBubble>
        ))}
      </div>

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
