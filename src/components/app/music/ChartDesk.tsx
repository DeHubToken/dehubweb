/**
 * ChartDesk
 * =========
 * One chart on the Music tab: a title, its chart orders, the selected entry
 * up front (player, station or stage card) and the numbered list beside it.
 * Audio uploads, music videos, radio and stages all use it, so every shelf
 * on the page reads the same way.
 *
 * @module components/app/music/ChartDesk
 */

import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Play from '@/components/ui/cut-icons/play';
import ChevronRight from '@/components/ui/cut-icons/next';
import { AppState } from '@/components/app/AppState';
import '@/components/app/audio/audio-studio.css';

export interface ChartDeskRow {
  id: string;
  title: string;
  subtitle?: string;
  /** Artwork beside the title; rows without one show only the number. */
  thumb?: string;
  trailing?: ReactNode;
}

const INITIAL_ROWS = 6;
const MORE_ROWS = 6;

export function ChartDesk<S extends string>({
  header,
  sorts,
  sort,
  onSort,
  sortLabel,
  rows,
  isLoading,
  empty,
  thumbs = 'none',
  renderSelected,
}: {
  header: ReactNode;
  sorts: { value: NoInfer<S>; label: string }[];
  sort: S;
  onSort: (sort: NoInfer<S>) => void;
  sortLabel: string;
  rows: ChartDeskRow[];
  isLoading: boolean;
  /** Shown when the selected order has nothing in it. */
  empty: { icon: 'audio' | 'videos' | 'stages'; title: string };
  /** Artwork shape in the list: 16:9 posters, square logos, or none. */
  thumbs?: 'none' | 'wide' | 'square';
  renderSelected: (id: string) => ReactNode;
}) {
  const { t: _copy } = _useCopy();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find(row => row.id === selectedId) || rows[0];
  const [visibleCount, setVisibleCount] = useState(INITIAL_ROWS);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new order starts at its number one with the short list again.
  useEffect(() => {
    setSelectedId(null);
    setVisibleCount(INITIAL_ROWS);
  }, [sort]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && visibleCount < rows.length) {
      setVisibleCount(prev => Math.min(prev + MORE_ROWS, rows.length));
    }
  }, [visibleCount, rows.length]);

  return (
    <div data-listening-desk>
      {header}
      <div data-audio-chart-sort role="group" aria-label={sortLabel}>
        {sorts.map(option => <button key={option.value} type="button" aria-pressed={sort === option.value} onClick={() => onSort(option.value)}>{option.label}</button>)}
      </div>
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[280px] flex-shrink-0">
              <div className="aspect-video rounded-xl bg-zinc-800 animate-pulse" />
              <div className="mt-2 h-3 bg-zinc-800 rounded w-3/4 animate-pulse" />
              <div className="mt-1 h-2.5 bg-zinc-800 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 || !selected ? (
        <AppState icon={empty.icon} title={empty.title} size="compact" />
      ) : (
        <div data-listening-desk-layout data-chart-thumbs={thumbs}>
          <div data-listening-desk-player>{renderSelected(selected.id)}</div>
          <div data-listening-desk-tracks ref={scrollRef} onScroll={handleScroll}>
            {rows.slice(0, visibleCount).map((row, index) => <button type="button" key={row.id} data-selected={row.id === selected.id} onClick={() => setSelectedId(row.id)} aria-pressed={row.id === selected.id}>
              <span data-track-number>{String(index + 1).padStart(2, '0')}</span>
              {thumbs !== 'none' && <span data-chart-thumb={thumbs}>{row.thumb ? <img src={row.thumb} alt="" loading="lazy" /> : <Play className="h-4 w-4" />}</span>}
              <span data-track-info><strong>{row.title}</strong>{row.subtitle && <small>{row.subtitle}</small>}</span>
              {row.trailing != null && <span data-track-duration>{row.trailing}</span>}
              <Play className="h-4 w-4 shrink-0" />
            </button>)}
            {visibleCount < rows.length && <button type="button" onClick={() => setVisibleCount(count => count + MORE_ROWS)}>{_copy('copy.14c21c5e3ffe', { defaultValue: 'See all ' })}<ChevronRight className="h-4 w-4" /></button>}
          </div>
        </div>
      )}
    </div>
  );
}
