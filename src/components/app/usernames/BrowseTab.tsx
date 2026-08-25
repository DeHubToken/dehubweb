/**
 * Browse Tab
 * ==========
 * Search the handles that are for sale, sort them, buy one.
 *
 * The banner above the grid is the part that is not obvious. When somebody
 * searches an exact handle, the server also says what that name *is* — and the
 * most useful answer is often "nobody has it, go and take it for free". A
 * marketplace that lets someone pay for a name they could have claimed in
 * Settings is not one anybody comes back to.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Check, Lock, User, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowseUsernames, type UsernameSort } from '@/hooks/use-username-market';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { UsernameCard } from './UsernameCard';
import { BuyUsernameDrawer } from './BuyUsernameDrawer';
import type { UsernameListing } from '@/lib/api/dehub/username-market';

const SORTS: { value: UsernameSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'shortest', label: 'Shortest first' },
];

const PRICE_PRESETS = [
  { label: 'Under 10k', min: undefined, max: 10_000 },
  { label: '10k – 100k', min: 10_000, max: 100_000 },
  { label: '100k – 1M', min: 100_000, max: 1_000_000 },
  { label: '1M+', min: 1_000_000, max: undefined },
];

export function BrowseTab() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // A shared listing link lands here with the handle already in the box.
  const [search, setSearch] = useState(() => searchParams.get('handle') || '');
  const [sort, setSort] = useState<UsernameSort>('newest');
  const [minPriceDhb, setMinPriceDhb] = useState<number | undefined>();
  const [maxPriceDhb, setMaxPriceDhb] = useState<number | undefined>();
  const [selected, setSelected] = useState<UsernameListing | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, isFetching } = useBrowseUsernames({
    search: debouncedSearch,
    sort,
    minPriceDhb,
    maxPriceDhb,
  });

  // Drop the deep-link param once it has been read into the box, so a later
  // search does not fight a stale URL.
  useEffect(() => {
    if (!searchParams.get('handle')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('handle');
    setSearchParams(next, { replace: true });
    // Runs once for the incoming link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listings = data?.listings ?? [];
  const hasPriceFilter = minPriceDhb !== undefined || maxPriceDhb !== undefined;
  const activeFilters = (hasPriceFilter ? 1 : 0) + (sort !== 'newest' ? 1 : 0);

  const clearFilters = () => {
    setMinPriceDhb(undefined);
    setMaxPriceDhb(undefined);
    setSort('newest');
  };

  const banner = useMemo(() => exactBanner(data?.exact ?? null, listings), [data?.exact, listings]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search a handle…"
          spellCheck={false}
          autoCapitalize="none"
          className="pl-9 bg-black/60 backdrop-blur-2xl border-white/10 rounded-xl text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Sort + price */}
      <div className="flex gap-2 items-center">
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <div>
              <LiquidGlassBubble
                shimmer
                noBorder
                className="cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:!flex [&>div]:!items-center [&>div]:!justify-center [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl"
                style={{ height: '32px', width: 'auto' }}
              >
                <span className="text-white text-xs font-medium px-3 whitespace-nowrap flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3 h-3" />
                  Filter{activeFilters ? ` (${activeFilters})` : ''}
                </span>
              </LiquidGlassBubble>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 bg-zinc-900 border-white/10 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Sort</Label>
              {SORTS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSort(option.value)}
                  className="w-full flex items-center justify-between text-sm text-white py-1"
                >
                  {option.label}
                  {sort === option.value && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Price (DHB)</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRICE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => { setMinPriceDhb(preset.min); setMaxPriceDhb(preset.max); }}
                    className={`text-xs rounded-lg border px-2 py-1.5 ${
                      minPriceDhb === preset.min && maxPriceDhb === preset.max
                        ? 'border-white/60 bg-white/10 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-400'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {data && (
          <span className="text-xs text-zinc-500 ml-auto">
            {data.total.toLocaleString()} for sale
          </span>
        )}
      </div>

      {banner}

      {/* Grid */}
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[88px] rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-500">
          {debouncedSearch ? 'No handles for sale match that.' : 'No handles are for sale yet.'}
        </div>
      ) : (
        <div className={`space-y-2.5 ${isFetching ? "opacity-60" : ""}`}>
          {listings.map(listing => (
            <UsernameCard key={listing.id} listing={listing} onClick={() => setSelected(listing)} />
          ))}
        </div>
      )}

      <BuyUsernameDrawer
        listing={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />

      {!isAuthenticated && listings.length > 0 && (
        <p className="text-xs text-zinc-500 text-center">Sign in to buy a handle.</p>
      )}
    </div>
  );
}

/**
 * What the searched-for handle actually is.
 *
 * Only rendered when it adds something the grid does not already say — a
 * listed handle is in the results below, so saying so twice is noise.
 */
function exactBanner(
  exact: { username: string; state: string } | null,
  listings: UsernameListing[],
) {
  if (!exact) return null;
  if (exact.state === 'listed' && listings.some(l => l.username === exact.username)) return null;

  const shell = 'rounded-xl border p-3 flex items-start gap-2.5 text-sm';

  if (exact.state === 'available') {
    return (
      <div className={`${shell} border-emerald-500/30 bg-emerald-500/10`}>
        <Tag className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-emerald-100">
          <span className="font-semibold break-all">@{exact.username}</span> is not taken. Claim it for free in{' '}
          <a href="/app/settings" className="underline">Settings → Profile</a> — there is nothing to buy.
        </p>
      </div>
    );
  }

  if (exact.state === 'taken') {
    return (
      <div className={`${shell} border-white/10 bg-white/5`}>
        <User className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <p className="text-zinc-300">
          <span className="font-semibold break-all">@{exact.username}</span> belongs to someone who has not
          listed it. You could <a href={`/${exact.username}`} className="underline">ask them</a>.
        </p>
      </div>
    );
  }

  if (exact.state === 'reserved') {
    return (
      <div className={`${shell} border-white/10 bg-white/5`}>
        <Lock className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <p className="text-zinc-300">
          <span className="font-semibold break-all">@{exact.username}</span> is a DeHub route, so nobody can
          hold it or sell it.
        </p>
      </div>
    );
  }

  return null;
}
