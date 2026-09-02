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
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
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

const SORTS: { value: UsernameSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'usernames.sortNewest' },
  { value: 'price_asc', labelKey: 'usernames.sortPriceAsc' },
  { value: 'price_desc', labelKey: 'usernames.sortPriceDesc' },
  { value: 'shortest', labelKey: 'usernames.sortShortest' },
];

/**
 * The band labels are read back as the key for the selected preset, so they
 * carry a stable `id` rather than being identified by their own display text.
 */
const PRICE_PRESETS = [
  { id: 'under10k', labelKey: 'usernames.bandUnder10k', min: undefined, max: 10_000 },
  { id: '10kTo100k', labelKey: 'usernames.band10kTo100k', min: 10_000, max: 100_000 },
  { id: '100kTo1m', labelKey: 'usernames.band100kTo1m', min: 100_000, max: 1_000_000 },
  { id: '1mPlus', labelKey: 'usernames.band1mPlus', min: 1_000_000, max: undefined },
];

export function BrowseTab() {
  const { t } = useTranslation();
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

  const banner = useMemo(() => exactBanner(data?.exact ?? null, listings, t), [data?.exact, listings, t]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('usernames.searchPlaceholder')}
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
                  {activeFilters ? t('usernames.filterCount', { count: activeFilters }) : t('usernames.filter')}
                </span>
              </LiquidGlassBubble>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 bg-zinc-900 border-white/10 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">{t('usernames.sort')}</Label>
              {SORTS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSort(option.value)}
                  className="w-full flex items-center justify-between text-sm text-white py-1"
                >
                  {t(option.labelKey)}
                  {sort === option.value && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">{t('usernames.priceDhb')}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRICE_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => { setMinPriceDhb(preset.min); setMaxPriceDhb(preset.max); }}
                    className={`text-xs rounded-lg border px-2 py-1.5 ${
                      minPriceDhb === preset.min && maxPriceDhb === preset.max
                        ? 'border-white/60 bg-white/10 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-400'
                    }`}
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                {t('usernames.clear')}
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {data && (
          <span className="text-xs text-zinc-500 ml-auto">
            {t('usernames.forSaleCount', { count: data.total })}
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
          {t(debouncedSearch ? 'usernames.noSearchMatch' : 'usernames.noneForSale')}
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
  // Takes the translator rather than calling the hook: this is a plain helper,
  // not a component.
  t: TFunction,
) {
  if (!exact) return null;
  if (exact.state === 'listed' && listings.some(l => l.username === exact.username)) return null;

  const shell = 'rounded-xl border p-3 flex items-start gap-2.5 text-sm';

  // Each sentence stays one key with the handle and the link inline, so a
  // translator can move the link to wherever their grammar wants it rather
  // than being handed three fragments in a fixed English order.
  if (exact.state === 'available') {
    return (
      <div className={`${shell} border-emerald-500/30 bg-emerald-500/10`}>
        <Tag className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-emerald-100">
          <Trans
            i18nKey="usernames.exactAvailable"
            values={{ handle: exact.username }}
            components={{
              handle: <span className="font-semibold break-all" />,
              settings: <a href="/app/settings" className="underline" />,
            }}
          />
        </p>
      </div>
    );
  }

  if (exact.state === 'taken') {
    return (
      <div className={`${shell} border-white/10 bg-white/5`}>
        <User className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <p className="text-zinc-300">
          <Trans
            i18nKey="usernames.exactTaken"
            values={{ handle: exact.username }}
            components={{
              handle: <span className="font-semibold break-all" />,
              profile: <a href={`/${exact.username}`} className="underline" />,
            }}
          />
        </p>
      </div>
    );
  }

  if (exact.state === 'reserved') {
    return (
      <div className={`${shell} border-white/10 bg-white/5`}>
        <Lock className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <p className="text-zinc-300">
          <Trans
            i18nKey="usernames.exactReserved"
            values={{ handle: exact.username }}
            components={{ handle: <span className="font-semibold break-all" /> }}
          />
        </p>
      </div>
    );
  }

  return null;
}
