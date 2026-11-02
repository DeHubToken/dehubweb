/**
 * Feed Search Lens
 * ================
 * The feed search on the colour themes (everything but System and Minimal).
 * Instead of melting the pill into a box (FeedSearchBar), the lit tab's glass
 * drops out of the bar like a droplet and lands as a round search lens just
 * above the keyboard, with the feed blurred behind it. The tab it came from
 * keeps a dashed ring. Once there are words, the lens floats up and docks under
 * the pill and the results grid ripples out below it.
 *
 *   [feed icon] [filters] [search box .........] [↑]
 *                      in Images · Drag up to close
 *
 * Closing: the ↑ button, dragging the lens up, tapping the blur, Esc, or
 * tapping the dashed tab. Holding the feed icon picks another feed.
 *
 * @module components/app/navigation/FeedSearchLens
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation as _useCopy } from 'react-i18next';
import Settings2 from '@/components/ui/cut-icons/settings';
import { cn } from '@/lib/utils';
import { FEED_TABS, FEED_TAB_ICON_SCALE } from '@/constants/app.constants';
import { useShortsEnabled } from '@/contexts/ShortsEnabledContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { FEED_SEARCH_TABS, closeFeedSearch, setFeedSearchQuery, useFeedSearch, type FeedSearchTab } from '@/lib/feed-search';

const CLOSE_MS = 240;
const LENS_H = 52;
/** Drag the lens this far up and it snaps back into its tab. */
const DRAG_CLOSE_PX = 70;

const GLASS = 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 border border-white/30';

/** System and Minimal (and their light twins) keep the Melt bar. */
export function useFeedSearchLens(): boolean {
  const { theme } = useAppTheme();
  return theme !== 'system' && theme !== 'minimal' && theme !== 'light';
}

interface FeedSearchLensProps {
  tab: FeedSearchTab;
  hasActiveFilters: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  onPickFeed: (tab: FeedSearchTab) => void;
}

/** Where the lens sits: docked under the pill, or resting above the keyboard. */
function useLensSpots(anchorRef: RefObject<HTMLSpanElement>) {
  const [spots, setSpots] = useState({ visible: false, dock: 120, rest: 400, accent: '#ffffff', from: { x: 0, y: 0 } });
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The pill this lens belongs to. Home's pill and the collapsed-sidebar
      // pill both mount a search; only the one on screen shows its lens.
      const row = anchorRef.current?.parentElement;
      const visible = !!row && row.getClientRects().length > 0;
      const lit = row?.querySelector<HTMLElement>('[data-feed-tab-btn][data-active="true"]');
      const nav = row?.closest<HTMLElement>('[data-feed-nav]') ?? row;
      const navBottom = nav ? nav.getBoundingClientRect().bottom : 100;
      const vv = window.visualViewport;
      const viewBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const rest = Math.max(navBottom + 24, Math.min(viewBottom - LENS_H - 64, window.innerHeight * 0.45));
      const t = lit?.getBoundingClientRect();
      setSpots({
        visible,
        dock: Math.max(8, navBottom + 10),
        rest,
        accent: lit ? getComputedStyle(lit).color : '#ffffff',
        from: t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : { x: window.innerWidth / 2, y: navBottom },
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [anchorRef]);
  return spots;
}

export function FeedSearchLens({ tab, hasActiveFilters, filtersOpen, onToggleFilters, onPickFeed }: FeedSearchLensProps) {
  const { t: _copy } = _useCopy();
  const { query } = useFeedSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [landed, setLanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const spots = useLensSpots(anchorRef);
  const docked = query.trim().length > 0;

  // The page reads this to keep room under the docked lens and draw the
  // dashed ring on the tab the lens came from (styles/feed-search.css).
  useEffect(() => {
    if (!spots.visible) return;
    const root = document.documentElement;
    root.dataset.feedLens = '';
    return () => { delete root.dataset.feedLens; };
  }, [spots.visible]);
  useEffect(() => {
    document.documentElement.dataset.feedLensDocked = docked ? 'true' : 'false';
    return () => { delete document.documentElement.dataset.feedLensDocked; };
  }, [docked]);

  useEffect(() => {
    // One frame at the tab, then fall: the transition does the drop.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLanded(true)));
    const focus = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(focus); };
  }, []);

  // The lens opens on the tab's pointerup; that tap's click must not land on
  // the blur behind it and close it again straight away.
  const openedAt = useRef(performance.now());
  const ghostClick = () => performance.now() - openedAt.current < 350;

  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const clearHold = () => {
    if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => clearHold, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setPicking(false);
    inputRef.current?.blur();
    setTimeout(closeFeedSearch, CLOSE_MS);
  };

  const { shortsEnabled } = useShortsEnabled();
  const feed = FEED_TABS.find((t) => t.value === tab);
  const Icon = feed?.icon;
  const placeholder = {
    home: _copy("copy.57e2faa5ec63", { defaultValue: "Search DeHub" }),
    shorts: _copy("copy.e8756c6865a5", { defaultValue: "Search shorts" }),
    images: _copy("copy.9e13d826baaf", { defaultValue: "Search images" }),
    videos: _copy("copy.c7661da99c41", { defaultValue: "Search videos" }),
    music: _copy("copy.cbf6f228327c", { defaultValue: "Search music" }),
  }[tab];

  const top = closing || !landed ? spots.from.y - LENS_H / 2 : (docked ? spots.dock : spots.rest) + drag;
  const lensStyle = {
    top,
    '--lens-accent': spots.accent,
    transform: closing || !landed ? 'scale(0.18)' : 'scale(1)',
    opacity: closing || !landed ? 0 : 1,
    transformOrigin: `${spots.from.x}px 50%`,
    transition: dragStart.current != null
      ? 'none'
      : closing
        ? `top ${CLOSE_MS}ms ease-in, transform ${CLOSE_MS}ms ease-in, opacity ${CLOSE_MS}ms ease-in`
        : 'top 460ms cubic-bezier(0.34, 1.32, 0.64, 1), transform 420ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 160ms ease-out',
  } as CSSProperties;

  return (
    <>
    <span ref={anchorRef} hidden />
    {spots.visible && createPortal(
    <>
      <div
        data-feed-lens-blur
        data-shown={!docked && landed && !closing ? '' : undefined}
        aria-hidden="true"
        onClick={() => { if (!ghostClick()) close(); }}
        className="fixed inset-0 z-[49]"
      />
      <div data-feed-lens data-no-swipe className="fixed inset-x-0 z-[106] mx-auto w-full max-w-[560px] px-4" style={lensStyle}>
        <div
          data-feed-lens-rim
          data-docked={docked ? '' : undefined}
          className="relative flex items-center gap-1 rounded-full px-1.5"
          style={{ height: LENS_H }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('input,button')) return;
            dragStart.current = e.clientY;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart.current == null) return;
            setDrag(Math.min(0, e.clientY - dragStart.current));
          }}
          onPointerUp={() => {
            if (dragStart.current == null) return;
            const pulled = -drag;
            dragStart.current = null;
            setDrag(0);
            if (pulled > DRAG_CLOSE_PX) close();
          }}
          onPointerCancel={() => { dragStart.current = null; setDrag(0); }}
        >
          <button
            type="button"
            data-feed-lens-scope
            onPointerDown={() => {
              held.current = false;
              clearHold();
              holdTimer.current = window.setTimeout(() => { held.current = true; setPicking(true); }, 450);
            }}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            onPointerCancel={clearHold}
            onContextMenu={(e) => { e.preventDefault(); clearHold(); held.current = true; setPicking(true); }}
            onClick={() => {
              clearHold();
              if (ghostClick()) return;
              if (held.current) { held.current = false; return; }
              setPicking((v) => !v);
            }}
            aria-label={_copy("copy.1aa9d734f2ee", { defaultValue: "Choose what to search" })}
            aria-haspopup="menu"
            aria-expanded={picking}
            className={cn('flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full text-white [-webkit-touch-callout:none]', GLASS)}
          >
            {Icon && <Icon className="h-4 w-4" style={{ transform: `scale(${FEED_TAB_ICON_SCALE[tab] ?? 1})` }} />}
          </button>
          <button
            type="button"
            data-feed-lens-filters
            onClick={() => { if (!ghostClick()) onToggleFilters(); }}
            aria-label={_copy("copy.546ebb8eb993", { defaultValue: "Filters" })}
            aria-expanded={filtersOpen}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
              hasActiveFilters || filtersOpen ? cn('text-white', GLASS) : 'text-zinc-400 [@media(hover:hover)]:hover:text-white',
            )}
          >
            <Settings2 className="h-4 w-4" style={{ transform: `scale(${FEED_TAB_ICON_SCALE.settings ?? 1})` }} />
          </button>
          <input
            ref={inputRef}
            data-feed-search-input
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
            className="h-10 min-w-0 flex-1 bg-transparent px-1.5 text-[15px] text-white placeholder:text-zinc-400 outline-none"
          />
          <button
            type="button"
            data-feed-lens-close
            onClick={close}
            aria-label={_copy("copy.55656b5e434f", { defaultValue: "Close search" })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-300 [@media(hover:hover)]:hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-zinc-400" aria-hidden="true">
          {_copy("copy.1d7234ff1b79", { defaultValue: "in {{feed}}", feed: feed?.label ?? '' })}
          {' · '}
          {_copy("copy.e122e5c2b563", { defaultValue: "Drag up to close" })}
        </p>
        {picking && (
          <div role="menu" data-feed-search-picker className="mx-auto mt-1 flex w-fit gap-1 rounded-full border border-white/[0.14] bg-zinc-900/95 p-1">
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
                  className={cn('flex h-9 w-11 items-center justify-center rounded-full', value === tab ? cn('text-white', GLASS) : 'text-zinc-400 hover:text-white')}
                >
                  <T.icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>,
    document.body,
    )}
    </>
  );
}
