/**
 * The card a /cinema/<type>/<id> link turns into.
 *
 * Rendered wherever DeHub shows user-written text, so a shared film in a DM
 * looks like a shared film in the feed. Like every other entity card it must
 * hand back a fallback rather than `null` when the title cannot be loaded:
 * surfaces strip the URL out of the text on the assumption the card replaces
 * it, so returning nothing deletes the link from the message.
 *
 * "Cannot be loaded" is the common case here, not the edge case — until the
 * JustWatch partnership completes the catalogue answers nothing at all, and
 * every one of these falls back to the chip. That is the intended behaviour.
 */
import { useNavigate } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { useJustWatchOffers } from '@/hooks/use-justwatch';
import { detectLocale } from '@/lib/cinema-locales';
import type { DehubLinkMatch } from '@/lib/dehub-links';

export function FilmLinkEmbed({
  link,
  compact = false,
  className = '',
  fallback,
}: {
  link: DehubLinkMatch;
  compact?: boolean;
  className?: string;
  fallback: ReactNode;
}) {
  const navigate = useNavigate();
  const objectType = link.filmObjectType ?? 'movie';
  const { data, isPending } = useJustWatchOffers(link.filmId ?? null, detectLocale(), objectType);
  const title = data?.title;

  // Nothing rendered mid-flight: a skeleton that resolves into a fallback chip
  // flickers on every message containing a film link, and the chip is small
  // enough that arriving late is not worth the layout shift.
  if (isPending) return null;
  if (!title) return <>{fallback}</>;

  const cheapest = title.offers
    .filter((o) => o.retailPrice != null && (o.monetizationType === 'rent' || o.monetizationType === 'buy'))
    .sort((a, b) => (a.retailPrice ?? 0) - (b.retailPrice ?? 0))[0];
  const streamCount = title.offers.filter((o) => o.monetizationType === 'flatrate').length;

  const summary = streamCount > 0
    ? `Streaming on ${streamCount} service${streamCount === 1 ? '' : 's'}`
    : cheapest
      ? 'Available to rent or buy'
      : 'See where to watch';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(link.path);
      }}
      data-no-navigate
      className={`mt-2 flex items-stretch gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] text-left transition-colors hover:bg-white/[0.07] ${
        compact ? 'w-[280px]' : 'w-full'
      } ${className}`}
    >
      <div className="w-16 shrink-0 bg-zinc-900">
        {title.poster ? (
          <img src={title.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Clapperboard className="h-5 w-5 text-zinc-700" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 py-2.5 pr-3">
        <p className="truncate text-sm font-medium text-white">{title.title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {title.year ?? '—'}
          {objectType === 'show' ? ' · Series' : ''}
        </p>
        <p className="mt-1.5 truncate text-xs text-zinc-400">{summary}</p>
      </div>
    </button>
  );
}
