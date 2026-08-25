import { Film, Tv } from 'lucide-react';
import type { JustWatchTitle } from '@/lib/api/justwatch';

export function TitleCard({
  title,
  selected,
  onSelect,
}: {
  title: JustWatchTitle;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = title.objectType === 'show' ? Tv : Film;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all ${
        selected
          ? 'border-white/60 ring-1 ring-white/40'
          : 'border-white/10 hover:border-white/30'
      }`}
    >
      <div className="relative aspect-[2/3] w-full bg-zinc-900">
        {title.poster ? (
          <img
            src={title.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="h-8 w-8 text-zinc-700" aria-hidden="true" />
          </div>
        )}

        {title.ranks?.weekly?.rank != null && title.ranks.weekly.rank <= 10 && (
          <span className="absolute left-2 top-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            #{title.ranks.weekly.rank} this week
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-sm font-medium leading-snug text-white">
          {title.title}
        </span>
        <span className="text-xs text-zinc-500">
          {title.year ?? '—'}
          {title.objectType === 'show' ? ' · Series' : ''}
        </span>
      </div>
    </button>
  );
}
