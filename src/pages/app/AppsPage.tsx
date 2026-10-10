import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * `/apps` — the mini app store.
 *
 * Lists apps whose review tier is `listed` or `verified`. Unlisted apps still
 * open from a shared link (marked "Unreviewed" in the player) but never
 * appear here. Ranking arrives with miniapp-rank; until then the order is
 * alphabetical, which at least is not a secret.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Blocks, Code2, Search } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { IslandAction, KitButton, PageBody, PageEmpty, PageIsland } from '@/components/app/page-kit/PageKit';
import { fetchAddedApps, fetchLatestScores, fetchListedApps, removeApp, type AddedApp, type MiniAppListing, type AppScore } from '@/lib/miniapp/registry';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
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
  const { walletAddress } = useAuth();
  const [added, setAdded] = useState<AddedApp[]>([]);
  useEffect(() => {
    let live = true;
    fetchAddedApps(walletAddress).then((rows) => {
      if (live) setAdded(rows);
    });
    return () => {
      live = false;
    };
  }, [walletAddress]);
  const remove = async (slug: string) => {
    try {
      await removeApp(slug);
      setAdded((rows) => rows.filter((r) => r.miniapp_apps?.slug !== slug));
      toast.success(t('miniApps.store.removed'));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const [query, setQuery] = useSurfaceDraft("pages/app/AppsPage.tsx:query", '');
  const [category, setCategory] = useState('all');
  const categories = useMemo(
    () => [...new Set((apps ?? []).map((a) => a.category).filter((c): c is string => Boolean(c)))].sort(),
    [apps],
  );
  const [scores, setScores] = useState<Map<string, AppScore>>(new Map());
  useEffect(() => {
    let live = true;
    fetchLatestScores().then((map) => {
      if (live) setScores(map);
    });
    return () => {
      live = false;
    };
  }, []);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Ranked by the published nightly score; apps it has not scored yet
    // (new listings) follow in name order.
    const rankOf = (id: string) => scores.get(id)?.rank ?? Number.MAX_SAFE_INTEGER;
    return (apps ?? [])
      .filter(
        (a) =>
          (category === 'all' || a.category === category) &&
          (!q || [a.name, a.subtitle, a.description, a.domain].some((v) => v?.toLowerCase().includes(q))),
      )
      .sort((a, b) => rankOf(a.id) - rankOf(b.id) || a.name.localeCompare(b.name));
  }, [apps, query, category, scores]);
  const rising = useMemo(() => (apps ?? []).filter((a) => scores.get(a.id)?.is_new), [apps, scores]);
  const navigate = useNavigate();

  // A failed read is kept apart from an empty store: it gets a retry, and a
  // list already on screen stays put.
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(() => {
    fetchListedApps().then((rows) => {
      if (!mounted.current) return;
      setFailed(rows === null);
      setApps((prev) => rows ?? prev ?? []);
    });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

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

      <PageIsland
        className="mx-auto max-w-4xl"
        icon={<Blocks className="h-7 w-7 shrink-0 text-white" />}
        title={t('miniApps.store.title')}
        actions={
          <IslandAction label={t('miniApps.store.buildCta')} onClick={() => navigate('/apps/dev')}>
            <Code2 className="h-[18px] w-[18px]" />
          </IslandAction>
        }
      >
        <p className="text-xs leading-relaxed text-zinc-400">{t('miniApps.store.intro')}</p>
      </PageIsland>

      <PageBody className="mx-auto max-w-4xl">
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

        {!query && category === 'all' && added.length > 0 ? (
          <section data-feed-item>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t('miniApps.store.yourApps')}
            </h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {added.map((row) =>
                row.miniapp_apps ? (
                  <div key={row.app_id} className="flex items-center gap-3 rounded-2xl bg-zinc-900/60 p-3 ring-1 ring-white/[0.06]">
                    <Link to={`/apps/${row.miniapp_apps.slug}?from=store`} className="flex min-w-0 flex-1 items-center gap-3">
                      {row.miniapp_apps.icon_url ? (
                        <img src={row.miniapp_apps.icon_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="h-12 w-12 shrink-0 rounded-xl bg-zinc-800" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{row.miniapp_apps.name}</p>
                        <p className="truncate text-xs text-zinc-400">
                          {row.notifications_on ? t('miniApps.store.notificationsOn') : row.miniapp_apps.domain}
                        </p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(row.miniapp_apps!.slug)}
                      className="shrink-0 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                    >
                      {t('miniApps.store.remove')}
                    </button>
                  </div>
                ) : null,
              )}
            </div>
          </section>
        ) : null}

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

        {!query && category === 'all' && rising.length > 0 ? (
          <section data-feed-item>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t('miniApps.store.rising')}
            </h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {rising.map((app) => (
                <AppCard key={app.id} app={app} />
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
        ) : apps.length === 0 && failed ? (
          <div data-feed-item data-kit-section role="alert" className="bg-zinc-900/60 ring-1 ring-white/[0.06]">
            <PageEmpty
              title={t('common.failedToLoad')}
              action={
                <KitButton
                  onClick={() => {
                    setApps(null);
                    load();
                  }}
                >
                  {t('common.retry')}
                </KitButton>
              }
            />
          </div>
        ) : apps.length === 0 ? (
          <div data-feed-item data-kit-section className="bg-zinc-900/60 ring-1 ring-white/[0.06]">
            <PageEmpty
              icon={<Blocks className="h-10 w-10 text-zinc-500" />}
              title={t('miniApps.store.emptyTitle')}
              body={t('miniApps.store.emptyBody')}
              action={<KitButton onClick={() => navigate('/apps/dev')}>{t('miniApps.store.buildCta')}</KitButton>}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {visible.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </PageBody>
    </div>
  );
}
