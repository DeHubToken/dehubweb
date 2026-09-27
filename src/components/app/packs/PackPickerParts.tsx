/**
 * Creator packs inside the chat picker: the Stickers tab, and the pack row
 * above the GIF search. Picking a sticker or a pack GIF sends it down the
 * same path as a GIPHY GIF (`onGifSelect(url)`), so every chat surface that
 * already takes GIFs takes these with no changes of its own.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { usePickerPacks, type CreatorPack, type PackItem, type PackKind } from '@/lib/creator-packs/api';

export function PackCover({ pack, className }: { pack: Pick<CreatorPack, 'cover_url' | 'name'>; className?: string }) {
  return pack.cover_url ? (
    <img src={pack.cover_url} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn('object-contain', className)} />
  ) : (
    <span className={cn('flex items-center justify-center text-[10px] font-semibold text-zinc-400', className)}>
      {pack.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PackStrip({
  packs,
  active,
  onChange,
  leading,
}: {
  packs: CreatorPack[];
  active: string | null;
  onChange: (id: string | null) => void;
  /** A first chip for the non-pack source (GIPHY), selected when `active` is null. */
  leading?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 border-b border-white/10 [scrollbar-width:none]">
      {leading && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'h-8 px-2.5 rounded-md text-[11px] font-semibold flex-shrink-0',
            active === null ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10',
          )}
        >
          {leading}
        </button>
      )}
      {packs.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.name}
          aria-label={p.name}
          onClick={() => onChange(p.id)}
          className={cn(
            'w-8 h-8 rounded-md flex-shrink-0 overflow-hidden p-0.5',
            active === p.id ? 'bg-white/15 ring-1 ring-white/40' : 'hover:bg-white/10',
          )}
        >
          <PackCover pack={p} className="w-full h-full" />
        </button>
      ))}
      <Link
        to="/packs"
        title={t('creatorPacks.manage')}
        aria-label={t('creatorPacks.manage')}
        className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-zinc-400 hover:bg-white/10 hover:text-white"
      >
        <Plus className="w-4 h-4" />
      </Link>
    </div>
  );
}

export function PackGrid({ kind, items, onSelect }: { kind: PackKind; items: PackItem[]; onSelect: (url: string) => void }) {
  return (
    <div className={cn('grid gap-1.5 p-2', kind === 'gif' ? 'grid-cols-2' : 'grid-cols-4')}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          title={it.emoji ?? undefined}
          onClick={() => onSelect(it.image_url)}
          className={cn(
            'rounded-lg overflow-hidden hover:bg-white/10 transition-colors',
            kind === 'gif' ? 'aspect-video hover:ring-2 hover:ring-white' : 'aspect-square p-1',
          )}
        >
          <img
            src={it.image_url}
            alt={it.emoji ?? ''}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={cn('w-full h-full', kind === 'gif' ? 'object-cover' : 'object-contain')}
          />
        </button>
      ))}
    </div>
  );
}

function EmptyPacks({ kind }: { kind: PackKind }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-xs text-zinc-400">{t(kind === 'gif' ? 'creatorPacks.emptyGifs' : 'creatorPacks.emptyStickers')}</p>
      <Link to="/packs" className="h-8 px-3 rounded-md bg-white text-black text-xs font-medium flex items-center">
        {t('creatorPacks.browseCreate')}
      </Link>
    </div>
  );
}

/** The Stickers tab. */
export function StickerPanel({ onSelect }: { onSelect: (url: string) => void }) {
  const { walletAddress } = useAuth();
  const { packs, items, loading } = usePickerPacks(walletAddress, 'sticker');
  const [active, setActive] = useState<string | null>(null);
  const current = active && packs.some((p) => p.id === active) ? active : packs[0]?.id ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }
  if (!packs.length) return <EmptyPacks kind="sticker" />;
  return (
    <>
      <PackStrip packs={packs} active={current} onChange={setActive} />
      <div className="max-h-72 overflow-y-auto">
        <PackGrid kind="sticker" items={(current && items[current]) || []} onSelect={onSelect} />
      </div>
    </>
  );
}

/** GIF packs for the GIF tab: the strip, and the selected pack's grid (null = show GIPHY). */
export function useGifPacks() {
  const { walletAddress } = useAuth();
  const { packs, items } = usePickerPacks(walletAddress, 'gif');
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (active && !packs.some((p) => p.id === active)) setActive(null);
  }, [active, packs]);
  return { packs, items: active ? items[active] ?? [] : null, active, setActive };
}
