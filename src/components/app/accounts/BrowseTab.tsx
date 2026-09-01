/**
 * Browse Tab
 * ==========
 * Search the accounts that are for sale, sort them, buy one.
 *
 * Unlike the username market there is no "this name is free, go claim it"
 * banner: what is for sale here is an audience and a history, not a string,
 * so an empty result simply means nothing matched.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowseAccounts, type AccountSort } from '@/hooks/use-account-market';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { AccountCard } from './AccountCard';
import { BuyAccountDrawer } from './BuyAccountDrawer';
import type { AccountListing } from '@/lib/api/dehub/account-market';

const SORTS: { value: AccountSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'accounts.sortNewest' },
  { value: 'price_asc', labelKey: 'accounts.sortPriceAsc' },
  { value: 'price_desc', labelKey: 'accounts.sortPriceDesc' },
  { value: 'followers', labelKey: 'accounts.sortFollowers' },
  { value: 'uploads', labelKey: 'accounts.sortUploads' },
];

/**
 * The band labels are read back as the key for the selected preset, so they
 * carry a stable `id` rather than being identified by their own display text.
 */
const PRICE_PRESETS = [
  { id: 'under10k', labelKey: 'accounts.bandUnder10k', min: undefined, max: 10_000 },
  { id: '10kTo100k', labelKey: 'accounts.band10kTo100k', min: 10_000, max: 100_000 },
  { id: '100kTo1m', labelKey: 'accounts.band100kTo1m', min: 100_000, max: 1_000_000 },
  { id: '1mPlus', labelKey: 'accounts.band1mPlus', min: 1_000_000, max: undefined },
];

export function BrowseTab() {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // A shared listing link lands here with the handle already in the box.
  const [search, setSearch] = useState(() => searchParams.get('handle') || '');
  const [sort, setSort] = useState<AccountSort>('newest');
  const [minPriceDhb, setMinPriceDhb] = useState<number | undefined>();
  const [maxPriceDhb, setMaxPriceDhb] = useState<number | undefined>();
  const [selected, setSelected] = useState<AccountListing | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isLoading, isFetching } = useBrowseAccounts({
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

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('accounts.searchPlaceholder')}
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
                  {activeFilters ? t('accounts.filterCount', { count: activeFilters }) : t('accounts.filter')}
                </span>
              </LiquidGlassBubble>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 bg-zinc-900 border-white/10 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">{t('accounts.sort')}</Label>
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
              <Label className="text-xs text-zinc-400">{t('accounts.priceDhb')}</Label>
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
                {t('accounts.clear')}
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {data && (
          <span className="text-xs text-zinc-500 ml-auto">
            {t('accounts.forSaleCount', { count: data.total })}
          </span>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[88px] rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-500">
          {t(debouncedSearch ? 'accounts.noSearchMatch' : 'accounts.noneForSale')}
        </div>
      ) : (
        <div className={`space-y-2.5 ${isFetching ? "opacity-60" : ""}`}>
          {listings.map(listing => (
            <AccountCard
              key={listing.id}
              listing={listing}
              isOwn={!!walletAddress && walletAddress.toLowerCase() === listing.seller.address.toLowerCase()}
              onClick={() => setSelected(listing)}
            />
          ))}
        </div>
      )}

      <BuyAccountDrawer
        listing={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />

      {!isAuthenticated && listings.length > 0 && (
        <p className="text-xs text-zinc-500 text-center">Sign in to buy an account.</p>
      )}
    </div>
  );
}
