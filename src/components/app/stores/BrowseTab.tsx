/**
 * Browse Tab
 * ===========
 * Public marketplace grid with category filters, search, and sort.
 */

import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export function BrowseTab() {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [selectedListing, setSelectedListing] = useState<any>(null);

  const { data: listings = [], isLoading } = useBrowseListings(category, sort, search);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[140px] bg-white/5 border-white/10">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price_asc">Price: Low→High</SelectItem>
            <SelectItem value="price_desc">Price: High→Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              category === c.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10'
            }`}
          >
            {c.label}
          </button>
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
      ) : listings.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No listings found. Be the first to sell something!
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {listings.map((listing: any) => (
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
