/**
 * Pick the strip of foil round a comic's cards: the theme's own foil or one of
 * the presets. The cover is shown as a live card above the swatches, so the
 * creator sees the border on their own art before posting.
 */
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { COMIC_BORDERS, COMIC_BORDER_LABEL, type ComicBorder } from '@/lib/comic-borders';
import '@/styles/comic.css';

const ComicDeckLazy = lazy(() => import('@/components/app/comic/ComicDeck').then(m => ({ default: m.ComicDeck })));

interface ComicBorderPickerProps {
  value: ComicBorder | null;
  onChange: (border: ComicBorder | null) => void;
  /** The first page, for the live preview. Left out, only the swatches show. */
  cover?: string;
  title?: string;
  disabled?: boolean;
}

export function ComicBorderPicker({ value, onChange, cover, title, disabled }: ComicBorderPickerProps) {
  const { t } = useTranslation();
  const options: (ComicBorder | null)[] = [null, ...COMIC_BORDERS];
  return (
    <div className="space-y-2" data-comic-border-picker>
      <p className="text-xs font-medium text-white/70">{t('comicBorder.title')}</p>
      {cover ? (
        <div className="mx-auto w-full max-w-[260px]">
          <Suspense fallback={<div style={{ aspectRatio: '3 / 4' }} />}>
            <ComicDeckLazy images={[cover]} title={title} border={value ?? undefined} aboveFold />
          </Suspense>
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={t('comicBorder.title')}>
        {options.map((option) => {
          const selected = option === value;
          const label = t(`comicBorder.${option ? COMIC_BORDER_LABEL[option] : 'theme'}`);
          return (
            <button
              key={option ?? 'theme'}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option)}
              className="flex w-14 shrink-0 flex-col items-center gap-1 disabled:opacity-50"
            >
              <span
                data-comic
                data-comic-border={option ?? undefined}
                className={cn(
                  'block h-[52px] w-9 rounded-[6px] p-[3px] shadow-md transition-transform',
                  selected ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-black/60' : 'opacity-80',
                )}
                style={{ background: 'var(--foil)' }}
              >
                <span className="block h-full w-full rounded-[3px]" style={{ background: 'var(--comic-face)' }} />
              </span>
              <span className={cn('w-full truncate text-center text-[10px] leading-tight', selected ? 'text-white' : 'text-white/60')}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
