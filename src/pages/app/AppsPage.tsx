/**
 * `/apps` — the mini app store.
 *
 * Lists apps whose review tier is `listed` or `verified`. Unlisted apps still
 * open from a shared link (marked "Unreviewed" in the player) but never
 * appear here. Ranking arrives with miniapp-rank; until then the order is
 * alphabetical, which at least is not a secret.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Blocks, Code2, Search } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { fetchListedApps, type MiniAppListing } from '@/lib/miniapp/registry';
import { ARCADE_GAMES } from '@/config/arcade-games';

function AppCard({ app }: { app: MiniAppListing }) {
  return (
    <Link
      to={`/apps/${app.slug}?from=store`}
      data-feed-item
      className="flex items-center gap-3 rounded-2xl bg-zinc-900/60 p-3 ring-1 ring-white/[0.06] transition-colors hover:bg-zinc-900"
    >
      {app.icon_url ? (
        <img src={app.icon_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
          <Blocks className="h-6 w-6 text-zinc-500" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-semibold text-white">
          {app.name}
          {app.tier === 'verified' ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" /> : null}
        </p>
        <p className="truncate text-xs text-zinc-400">{app.subtitle ?? app.domain}</p>
      </div>
    </Link>
  );
}

export default function AppsPage() {
  const { t } = useTranslation();
  const [apps, setApps] = useState<MiniAppListing[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const categories = useMemo(
    () => [...new Set((apps ?? []).map((a) => a.category).filter((c): c is string => Boolean(c)))].sort(),
    [apps],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps ?? []).filter(
      (a) =>
        (category === 'all' || a.category === category) &&
        (!q || [a.name, a.subtitle, a.description, a.domain].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [apps, query, category]);
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  useEffect(() => {
    let live = true;
    fetchListedApps().then((rows) => {
      if (live) setApps(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('miniApps.store.seoTitle')}
        description={t('miniApps.store.seoDescription')}
        url="https://dehub.io/apps"
        image="https://dehub.io/og/apps.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'DeHub Apps',
          url: 'https://dehub.io/apps',
          hasPart: (apps ?? []).map((app) => ({
            '@type': 'SoftwareApplication',
            name: app.name,
            url: `https://dehub.io/apps/${app.slug}`,
            applicationCategory: app.category ?? 'WebApplication',
          })),
        }}
      />

      <div
        data-feed-nav-outer
        className="sticky top-11 z-50 mx-auto max-w-4xl bg-black px-2 pb-0 pt-1 sm:px-3 sm:pt-1 lg:top-0 lg:pt-2"
      >
        <div data-page-bento className="space-y-2 rounded-2xl bg-zinc-900 px-4 py-3">
          <div className="flex items-center gap-3">
            <Blocks className="h-8 w-8 shrink-0 text-white" />
            <h1 className="text-xl font-bold text-white">{t('miniApps.store.title')}</h1>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.store.intro')}</p>
          <Link
            to="/apps/dev"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          >
            <Code2 className="h-3.5 w-3.5" /> {t('miniApps.store.buildCta')}
          </Link>
        </div>
      </div>

      <div ref={contentRef} className="mx-auto max-w-4xl space-y-3 px-2 pb-24 pt-2 sm:px-3">
        <div data-feed-item className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-zinc-900/60 px-3 ring-1 ring-white/[0.06]">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('miniApps.store.search')}
              aria-label={t('miniApps.store.search')}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
          </div>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {['all', ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  data-filter-chip
                  data-active={category === c ? 'true' : 'false'}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    category === c ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {c === 'all' ? t('miniApps.store.all') : t(`miniApps.category.${c}`)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {!query && category === 'all' ? (
          <section data-feed-item>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t('miniApps.store.fromDehub')}
            </h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {ARCADE_GAMES.map((game) => (
                <Link
                  key={game.slug}
                  to={`/arcade/${game.slug}`}
                  className="flex items-center gap-3 rounded-2xl bg-zinc-900/60 p-3 ring-1 ring-white/[0.06] transition-colors hover:bg-zinc-900"
                >
                  <img src={game.art} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                    <p className="truncate text-xs text-zinc-400">{game.tagline}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {apps !== null && apps.length > 0 && visible.length === 0 ? (
          <p className="px-1 text-sm text-zinc-400">{t('miniApps.store.noMatch')}</p>
        ) : null}

        {apps === null ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-900/60" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div data-feed-item className="rounded-2xl bg-zinc-900/60 p-6 text-center ring-1 ring-white/[0.06]">
            <p className="text-sm font-semibold text-white">{t('miniApps.store.emptyTitle')}</p>
            <p className="mt-1 text-xs text-zinc-400">{t('miniApps.store.emptyBody')}</p>
            <Link to="/apps/dev" className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
              {t('miniApps.store.buildCta')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {visible.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
