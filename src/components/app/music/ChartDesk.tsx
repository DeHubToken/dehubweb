/**
 * ChartDesk
 * =========
 * One chart on the Music tab: a title, its chart orders, the selected entry
 * up front (player, station or stage card) and the numbered list beside it.
 * The two halves are the same width and the list stretches to the height of
 * the entry beside it, so every chart reads as two equal decks. The list
 * holds every entry and scrolls on its own, with no scrollbar.
 * Audio uploads, music videos, radio and stages all use it, so every shelf
 * on the page reads the same way.
 *
 * @module components/app/music/ChartDesk
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import Play from '@/components/ui/cut-icons/play';
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
  search: searchProp,
  onSearchChange,
  moreRows,
  isSearchingMore = false,
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
  /** `next` selects the entry after this one, wrapping to the top. */
  renderSelected: (id: string, controls: { next: () => void }) => ReactNode;
  /** The search text, when the chart's owner also searches beyond the chart. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** Matches from the whole zone, listed after the chart's own matches. */
  moreRows?: ChartDeskRow[];
  isSearchingMore?: boolean;
}) {
  const { t } = useTranslation();
  const [ownSearch, setOwnSearch] = useState('');
  const search = onSearchChange ? searchProp ?? '' : ownSearch;
  const setSearch = onSearchChange ?? setOwnSearch;
  const query = search.trim().toLocaleLowerCase();
  const chartMatches = rows.filter(row => !query || `${row.title} ${row.subtitle ?? ''}`.toLocaleLowerCase().includes(query));
  const chartIds = new Set(chartMatches.map(row => row.id));
  const matchingRows = query && moreRows?.length
    ? [...chartMatches, ...moreRows.filter(row => !chartIds.has(row.id) && (chartIds.add(row.id), true))]
    : chartMatches;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = matchingRows.find(row => row.id === selectedId) || matchingRows[0];
  const selectedIndex = selected ? matchingRows.indexOf(selected) : -1;
  const sortName = sorts.find(option => option.value === sort)?.label;
  const next = () => {
    if (matchingRows.length > 1) setSelectedId(matchingRows[(selectedIndex + 1) % matchingRows.length].id);
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new order starts at its number one, scrolled back to the top.
  useEffect(() => {
    setSelectedId(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [sort]);

  return (
    <div data-listening-desk>
      {header}
      <Input
        type="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        aria-label={`${t('common.search', { defaultValue: 'Search' })}: ${sortLabel}`}
        placeholder={t('common.search', { defaultValue: 'Search' })}
        className="mb-3"
      />
      <div data-audio-chart-sort role="group" aria-label={sortLabel}>
        {sorts.map(option => <button key={option.value} type="button" aria-pressed={sort === option.value} onClick={() => onSort(option.value)}>{option.label}</button>)}
      </div>
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[280px] flex-shrink-0">
              <div className="aspect-video rounded-xl theme-skeleton animate-pulse" />
              <div className="mt-2 h-3 theme-skeleton rounded w-3/4 animate-pulse" />
              <div className="mt-1 h-2.5 theme-skeleton rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : query && !selected && isSearchingMore ? (
        <div data-listening-desk-searching className="py-6 text-center text-sm opacity-70">{t('explorePage.searching', { defaultValue: 'Searching...' })}</div>
      ) : (rows.length === 0 && !query) || !selected ? (
        <AppState icon={empty.icon} title={query ? t('explorePage.noResults', { defaultValue: 'No results found' }) : empty.title} size="compact" />
      ) : (
        <div data-listening-desk-layout data-chart-thumbs={thumbs}>
          <div data-listening-desk-player>
            {rows.includes(selected) && <span data-desk-rank>#{rows.indexOf(selected) + 1}{sortName ? ` · ${sortName}` : ''}</span>}
            {renderSelected(selected.id, { next })}
          </div>
          <div data-listening-desk-tracks><div data-listening-desk-scroll ref={scrollRef}>
            {matchingRows.map(row => <button type="button" key={row.id} data-selected={row.id === selected.id} onClick={() => setSelectedId(row.id)} aria-pressed={row.id === selected.id}>
              <span data-track-number>{rows.includes(row) ? String(rows.indexOf(row) + 1).padStart(2, '0') : '–'}</span>
              {thumbs !== 'none' && <span data-chart-thumb={thumbs}>{row.thumb ? <img src={row.thumb} alt="" loading="lazy" /> : <Play className="h-4 w-4" />}</span>}
              <span data-track-info><strong>{row.title}</strong>{row.subtitle && <small>{row.subtitle}</small>}</span>
              {row.trailing != null && <span data-track-duration>{row.trailing}</span>}
              <Play className="h-4 w-4 shrink-0" />
            </button>)}
          </div></div>
        </div>
      )}
    </div>
  );
}

