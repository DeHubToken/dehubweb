/**
 * A `dehub.io/apps/<slug>` link, carded: the app's icon, name and real domain,
 * and an Open button that launches it from the feed — the Farcaster embed
 * loop, where every shared link is a way into the app.
 *
 * The link's own query string is kept, so a "join my game" link opens the
 * app in that game rather than on its home screen.
 */
import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Blocks } from 'lucide-react';
import { fetchAppBySlug } from '@/lib/miniapp/registry';

interface AppLinkEmbedProps {
  slug: string;
  /** The in-app path the link pointed at, query string included. */
  path: string;
  fallback?: ReactNode;
}

export function AppLinkEmbed({ slug, path, fallback = null }: AppLinkEmbedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: app, isLoading } = useQuery({
    queryKey: ['miniapp-by-slug', slug],
    queryFn: () => fetchAppBySlug(slug),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="mt-2 h-[72px] animate-pulse rounded-xl bg-white/[0.04]" />;
  if (!app) return <>{fallback}</>;

  const open = (e: MouseEvent) => {
    e.stopPropagation();
    const target = new URL(path, 'https://dehub.io');
    target.searchParams.set('from', 'feed');
    navigate(`${target.pathname}${target.search}`);
  };

  return (
    <div
      data-embed
      className="mt-2 flex items-center gap-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]"
      onClick={(e) => e.stopPropagation()}
    >
      {app.icon_url ? (
        <img src={app.icon_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
          <Blocks className="h-5 w-5 text-zinc-500" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-semibold text-white">
          {app.name}
          {app.tier === 'verified' ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" /> : null}
        </p>
        <p className="truncate text-xs text-zinc-400">{app.subtitle ?? app.domain}</p>
      </div>
      <button
        type="button"
        onClick={open}
        className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90"
      >
        {t('miniApps.card.open')}
      </button>
    </div>
  );
}
