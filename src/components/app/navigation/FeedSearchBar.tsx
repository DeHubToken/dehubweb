/**
 * Feed Search Bar
 * ===============
 * What the feed pill turns into when the lit tab is tapped again. It grows
 * out of that tab (see styles/feed-search.css) and covers the tab row:
 *
 *   [feed icon] [filters] [search box ...........] [x]
 *
 * The feed icon says which feed is searched; tapping it offers the other
 * searchable feeds. The filters button opens the same filter panel as the
 * pill's own sliders button, and the results follow those filters.
 *
 * @module components/app/navigation/FeedSearchBar
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import Settings2 from '@/components/ui/cut-icons/settings';
import X from '@/components/ui/cut-icons/close';
import { cn } from '@/lib/utils';
import { FEED_TABS, FEED_TAB_ICON_SCALE } from '@/constants/app.constants';
import { useShortsEnabled } from '@/contexts/ShortsEnabledContext';
import { FEED_SEARCH_TABS, closeFeedSearch, setFeedSearchQuery, useFeedSearch, type FeedSearchTab } from '@/lib/feed-search';

const CLOSE_MS = 220;

/** Glass bubble: the same look as the lit tab and the filters-on state. */
const GLASS = 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 border border-white/30';

interface FeedSearchBarProps {
  tab: FeedSearchTab;
  hasActiveFilters: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  onPickFeed: (tab: FeedSearchTab) => void;
}

export function FeedSearchBar({ tab, hasActiveFilters, filtersOpen, onToggleFilters, onPickFeed }: FeedSearchBarProps) {
  const { t: _copy } = _useCopy();
  const { query } = useFeedSearch();
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [melt, setMelt] = useState<CSSProperties>({});
  const [closing, setClosing] = useState(false);
  const [picking, setPicking] = useState(false);

  // Start the melt from the tab that was tapped.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const row = bar?.parentElement;
    const lit = row?.querySelector<HTMLElement>('[data-feed-tab-btn][data-active="true"]');
    if (!bar || !lit) return;
    const b = bar.getBoundingClientRect();
    const t = lit.getBoundingClientRect();
    setMelt({ '--melt-l': `${Math.max(0, t.left - b.left)}px`, '--melt-r': `${Math.max(0, b.right - t.right)}px` } as CSSProperties);
  }, []);

  useEffect(() => {
    // Focus after the first frame so phones raise the keyboard for it.
    const id = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    inputRef.current?.blur();
    setTimeout(closeFeedSearch, CLOSE_MS);
  };

  const { shortsEnabled } = useShortsEnabled();
  const Icon = FEED_TABS.find((t) => t.value === tab)?.icon;
  const placeholder = {
    home: _copy("copy.57e2faa5ec63", { defaultValue: "Search DeHub" }),
    shorts: _copy("copy.e8756c6865a5", { defaultValue: "Search shorts" }),
    images: _copy("copy.9e13d826baaf", { defaultValue: "Search images" }),
    videos: _copy("copy.c7661da99c41", { defaultValue: "Search videos" }),
    music: _copy("copy.cbf6f228327c", { defaultValue: "Search music" }),
  }[tab];

  return (
    <div
      ref={barRef}
      data-feed-search-bar
      data-closing={closing ? '' : undefined}
      data-no-swipe
      className="absolute inset-0 z-50 flex items-center gap-1 px-1"
      style={melt}
    >
      <button
        type="button"
        data-feed-search-scope
        onClick={() => setPicking((p) => !p)}
        aria-label={_copy("copy.1aa9d734f2ee", { defaultValue: "Choose what to search" })}
        aria-expanded={picking}
        className={cn('relative flex h-[29px] w-10 shrink-0 items-center justify-center rounded-[10px] text-white', GLASS)}
      >
        {Icon && <Icon className="h-4 w-4" style={{ transform: `scale(${FEED_TAB_ICON_SCALE[tab] ?? 1})` }} />}
      </button>
      <button
        type="button"
        data-feed-search-filters
        onClick={onToggleFilters}
        aria-label={_copy("copy.546ebb8eb993", { defaultValue: "Filters" })}
        aria-expanded={filtersOpen}
        className={cn(
          'relative flex h-[29px] w-10 shrink-0 items-center justify-center rounded-[10px] transition-colors',
          hasActiveFilters || filtersOpen ? cn('text-white', GLASS) : 'text-zinc-400 [@media(hover:hover)]:hover:text-white',
        )}
      >
        <Settings2 className="h-4 w-4" style={{ transform: `scale(${FEED_TAB_ICON_SCALE.settings ?? 1})` }} />
      </button>
      <input
        ref={inputRef}
        data-feed-search-input
        // Not type="search": every search input gets the boxed search-field
        // look (styles/search-fields.css), and here the pill is the box.
        type="text"
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setFeedSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Enter') inputRef.current?.blur();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-[29px] min-w-0 flex-1 bg-transparent px-1.5 text-[15px] text-white placeholder:text-zinc-500 outline-none"
      />
      <button
        type="button"
        data-feed-search-close
        onClick={close}
        aria-label={_copy("copy.55656b5e434f", { defaultValue: "Close search" })}
        className="flex h-[29px] w-9 shrink-0 items-center justify-center rounded-[10px] text-zinc-400 [@media(hover:hover)]:hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      {picking && (
        <div
          role="menu"
          data-feed-search-picker
          className="absolute left-0 top-[calc(100%+6px)] z-50 flex gap-1 rounded-xl border border-white/[0.14] bg-zinc-900/90 p-1 backdrop-blur-xl"
        >
          {FEED_SEARCH_TABS.map((value) => {
            if (value === 'shorts' && !shortsEnabled) return null;
            const T = FEED_TABS.find((t) => t.value === value);
            if (!T) return null;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={value === tab}
                aria-label={T.label}
                title={T.label}
                onClick={() => { setPicking(false); onPickFeed(value); inputRef.current?.focus({ preventScroll: true }); }}
                className={cn('flex h-9 w-11 items-center justify-center rounded-[10px]', value === tab ? cn('text-white', GLASS) : 'text-zinc-400 hover:text-white')}
              >
                <T.icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
