import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Loader2, Clapperboard, Share2, ArrowLeft } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TitleCard } from '@/components/cinema/TitleCard';
import { OfferPanel } from '@/components/cinema/OfferPanel';
import { FilmReviews } from '@/components/cinema/FilmReviews';
import { ShareEntityDrawer } from '@/components/app/ShareEntityDrawer';
import {
  useJustWatchOffers,
  useJustWatchProviders,
  useJustWatchSearch,
  JustWatchNotConfiguredError,
} from '@/hooks/use-justwatch';
import {
  CINEMA_LOCALES,
  detectLocale,
  localeLabel,
  rememberLocale,
} from '@/lib/cinema-locales';
import { dehubLinkFor } from '@/lib/dehub-links';
import type { ObjectType } from '@/lib/api/justwatch';

const pageDescription =
  'Find out where to stream, rent or buy any film or series, with live prices for your country. DeHub Cinema covers every major service in 140+ countries.';

/** Debounce keeps a burst of keystrokes from becoming a burst of upstream
 *  calls — partner API quota is per-account, not per-visitor. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CinemaPage() {
  const navigate = useNavigate();
  // The open title lives in the URL, not in state. It has to: a film with no
  // address of its own cannot be shared, linked, carded or indexed, and every
  // one of those is the point of the share button below.
  const { filmType, filmId } = useParams<{ filmType?: string; filmId?: string }>();
  const openObjectType: ObjectType = filmType === 'series' ? 'show' : 'movie';

  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<ObjectType>('movie');
  const [locale, setLocale] = useState(() => detectLocale());
  const [shareOpen, setShareOpen] = useState(false);

  const debouncedQuery = useDebounced(query, 350);

  const search = useJustWatchSearch(debouncedQuery, locale, searchType);
  const providers = useJustWatchProviders(locale);
  const offers = useJustWatchOffers(filmId ?? null, locale, openObjectType);

  const notConfigured =
    search.error instanceof JustWatchNotConfiguredError ||
    providers.error instanceof JustWatchNotConfiguredError ||
    offers.error instanceof JustWatchNotConfiguredError;

  const results = search.data?.results ?? [];
  const current = localeLabel(locale);
  const openTitle = offers.data?.title ?? null;

  // A title's page keeps its own tab title and share card. Falls back to the
  // hub's copy while the fetch is in flight so the tab never reads "undefined".
  const seo = openTitle
    ? {
        title: `${openTitle.title}${openTitle.year ? ` (${openTitle.year})` : ''} — Where to Watch | DeHub`,
        description:
          openTitle.shortDescription ??
          `Where to stream, rent or buy ${openTitle.title} in ${current.country} and 140+ other countries.`,
        url: `https://dehub.io/cinema/${filmType}/${filmId}`,
      }
    : {
        title: 'Cinema | Where to Stream, Rent or Buy Any Film | DeHub',
        description: pageDescription,
        url: 'https://dehub.io/cinema',
      };

  const jsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'DeHub Cinema',
          url: 'https://dehub.io/cinema',
          applicationCategory: 'EntertainmentApplication',
          operatingSystem: 'Web',
          description: pageDescription,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
        {
          '@type': 'WebPage',
          name: 'DeHub Cinema',
          url: 'https://dehub.io/cinema',
          description: pageDescription,
          isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' },
        },
      ],
    }),
    [],
  );

  const shareUrl = filmId ? dehubLinkFor.film(openObjectType, filmId) : '';

  return (
    <>
      <SEOHead
        title={seo.title}
        description={seo.description}
        image="https://dehub.io/og/cinema.jpg"
        url={seo.url}
        jsonLd={jsonLd}
      />

      {/* No min-h-screen and no background of its own: this renders inside
          AppLayout, which owns the page frame, the scroller and the themed
          backdrop. Painting black here would punch a hole through every
          non-default theme. */}
      <main className="px-4 pb-24 pt-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="max-w-3xl">
            <div className="flex items-center gap-2 text-zinc-500">
              <Clapperboard className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-[0.18em]">Cinema</span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              Where to watch anything
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-400 sm:text-lg">
              Search any film or series and see every legal way to watch it in your
              country — what it streams on, what it costs to rent, and what it costs
              to own.
            </p>
          </header>

          {notConfigured ? (
            <div className="mt-10 max-w-2xl rounded-2xl border border-white/10 p-8">
              <h2 className="text-lg font-semibold text-white">Opening soon</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Cinema is built and waiting on the data partnership that supplies
                availability and pricing. It goes live here the moment that
                completes — no further changes needed.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchType === 'movie' ? 'Search films…' : 'Search series…'}
                    aria-label={searchType === 'movie' ? 'Search films' : 'Search series'}
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Content type"
                  className="flex h-11 shrink-0 items-center rounded-xl border border-white/10 p-1"
                >
                  {(['movie', 'show'] as ObjectType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSearchType(type)}
                      aria-pressed={searchType === type}
                      className={`h-full rounded-lg px-4 text-sm transition-colors ${
                        searchType === type
                          ? 'bg-white text-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {type === 'movie' ? 'Films' : 'Series'}
                    </button>
                  ))}
                </div>

                <Select
                  value={locale}
                  onValueChange={(value) => {
                    setLocale(value);
                    rememberLocale(value);
                  }}
                >
                  <SelectTrigger
                    aria-label="Country"
                    className="h-11 w-full shrink-0 rounded-xl border-white/10 bg-white/[0.03] text-sm text-white sm:w-56"
                  >
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true">{current.flag}</span>
                        {current.country}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CINEMA_LOCALES.map((l) => (
                      <SelectItem key={l.locale} value={l.locale}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true">{l.flag}</span>
                          {l.country}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="mt-3 text-xs text-zinc-600">
                Prices and availability are for {current.country}. Streaming rights
                differ by country, so the same film can cost more, less, or nothing
                elsewhere.
              </p>

              <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
                <section aria-label="Search results">
                  {search.isFetching && (
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Searching…
                    </div>
                  )}

                  {/* An errored search is not an empty one. Saying "nothing
                      found" when the request failed reads as "that film does
                      not exist", which sends people away rather than back. */}
                  {!search.isFetching && search.isError && (
                    <p className="text-sm text-zinc-400">
                      Search is unavailable right now. Try again in a moment.
                    </p>
                  )}

                  {!search.isFetching &&
                    !search.isError &&
                    debouncedQuery.trim().length >= 2 &&
                    results.length === 0 && (
                      <p className="text-sm text-zinc-500">
                        Nothing found for “{debouncedQuery}”. Check the spelling, or
                        try the original-language title.
                      </p>
                    )}

                  {debouncedQuery.trim().length < 2 && !search.isError && (
                    <p className="text-sm text-zinc-600">
                      Start typing to search {searchType === 'movie' ? 'films' : 'series'}.
                    </p>
                  )}

                  {results.length > 0 && (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {results.map((title) => (
                        <li key={`${title.justwatchId}-${title.title}`}>
                          <TitleCard
                            title={title}
                            selected={String(title.justwatchId) === filmId}
                            onSelect={() =>
                              navigate(
                                `/cinema/${searchType === 'show' ? 'series' : 'film'}/${title.justwatchId}`,
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <aside aria-label="Where to watch" className="lg:sticky lg:top-16 lg:self-start">
                  {filmId ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => navigate('/cinema')}
                          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          Back to search
                        </button>

                        <button
                          type="button"
                          onClick={() => setShareOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/5"
                        >
                          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Share
                        </button>
                      </div>

                      <OfferPanel
                        detail={openTitle}
                        providers={providers.data?.providers ?? []}
                        locale={locale}
                        isLoading={offers.isPending || offers.isFetching}
                      />

                      <FilmReviews
                        justwatchId={filmId}
                        objectType={openObjectType}
                        title={openTitle}
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 p-6">
                      <p className="text-sm text-zinc-500">
                        Pick a title to see every way to watch it in {current.country}.
                      </p>
                    </div>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </main>

      {filmId && (
        <ShareEntityDrawer
          open={shareOpen}
          onOpenChange={setShareOpen}
          url={shareUrl}
          shareTitle={openTitle ? `${openTitle.title} — where to watch` : 'Where to watch'}
        />
      )}
    </>
  );
}
