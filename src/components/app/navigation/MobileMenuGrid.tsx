import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { Film, Image as ImageIcon, Mic, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/lib/route-preload';
import { isHomePath } from '@/lib/home-path';
import { resolveHomeNavIntent } from '@/lib/home-nav-intent';
import { scrollDocumentToSmooth } from '@/lib/document-scroll';
import { openStageModal } from '@/contexts/StageContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import type { NavItem } from '@/types/app.types';
import { NAV_LABEL_KEYS } from './SidebarNavItem';

/**
 * The mobile menu sheet's tile grid.
 *
 * Three columns of glossy 3D icons, the same per-theme artwork the feed tabs
 * and empty states use (public/theme-icons/<theme>/<key>.webp), so the sheet
 * reskins with the theme for free. Every rail row maps to a piece of that set:
 * a flat glyph beside the glossy renders reads as a broken tile, so the glyph
 * is only the fallback for artwork that fails to load.
 */

// Rail row → artwork. Rows without a bespoke render borrow the closest one.
const NAV_ICON_KEYS: Record<string, ThemeIconKey> = {
  Home: 'home', Profile: 'profile', Explore: 'search', Notifications: 'notifications',
  Messages: 'messages', Arcade: 'arcade', Communities: 'communities', Assistant: 'assistant',
  Settings: 'settings', Stages: 'stages', Bookmarks: 'bookmarks', Command: 'command',
  Events: 'events', Leaderboard: 'trophy', 'Feature Requests': 'features', Staking: 'staking',
  SuperPowers: 'superpowers', Governance: 'governance', DAO: 'dao', Bounties: 'bounties',
  Careers: 'careers', Stores: 'stores', Fractions: 'fractions', Usernames: 'usernames',
  Accounts: 'accounts', Advertising: 'ads', 'Live TV': 'tv', Prompt: 'wand',
  Glossary: 'glossary', Stats: 'stats', 'Buy Tokens': 'buy', Bridge: 'bridge',
  Wallet: 'buy', Affiliate: 'subscriptions', Converter: 'videos', Migrate: 'bridge',
  Guide: 'pinned', Docs: 'posts', Blog: 'email',
};

const HOME_STATE_STORAGE_KEY = 'home-feed-state';
const HOME_TAB_SWITCH_EVENT = 'switch-home-tab';

/** A home-feed tab, reached from the sheet as if it were a page. */
interface FeedTile {
  tab: 'videos' | 'images' | 'music' | 'live';
  labelKey: string;
  iconKey: ThemeIconKey;
  glyph: LucideIcon;
  path: string;
}

const FEED_TILES: FeedTile[] = [
  { tab: 'videos', labelKey: 'feed.videos', iconKey: 'videos', glyph: Film, path: '/videos' },
  { tab: 'images', labelKey: 'feed.images', iconKey: 'images', glyph: ImageIcon, path: '/app' },
  { tab: 'music', labelKey: 'feed.music', iconKey: 'audio', glyph: Mic, path: '/app' },
  { tab: 'live', labelKey: 'feed.live', iconKey: 'live', glyph: Radio, path: '/app' },
];

// The curated first screen, in order. Home, then the four feed tabs, then
// these rail rows. Everything else in NAV_ITEMS follows under a divider.
const PINNED_AFTER_FEEDS = ['Messages', 'Notifications', 'Bookmarks', 'Stores', 'Staking', 'Profile', 'Settings'];

interface TileShellProps {
  label: string;
  iconKey?: ThemeIconKey;
  glyph: LucideIcon;
  active?: boolean;
  badge?: number;
}

function TileBody({ label, iconKey, glyph: Glyph, active, badge }: TileShellProps) {
  // A missing or blocked file would otherwise leave a broken-image box.
  const [artFailed, setArtFailed] = useState(false);
  const { theme } = useAppTheme();
  useEffect(() => setArtFailed(false), [iconKey, theme]);
  return (
    <>
      <span className="relative flex h-[52px] w-[52px] items-center justify-center">
        {iconKey && !artFailed ? (
          <ThemedIcon
            icon={iconKey}
            alt=""
            className="h-[52px] w-[52px] object-contain"
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <Glyph data-menu-glyph className="h-7 w-7 text-zinc-200" strokeWidth={1.75} />
        )}
        {!!badge && badge > 0 && (
          <span data-menu-badge className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className={cn('w-full truncate text-center text-[12.5px] leading-tight', active ? 'font-semibold text-white' : 'font-medium text-zinc-200')}>
        {label}
      </span>
    </>
  );
}

const tileClass = (active: boolean) => cn(
  'flex flex-col items-center justify-center gap-2 rounded-[14px] p-3 min-h-[96px] border transition-colors',
  active
    ? 'bg-white/[0.12] border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
    : 'bg-white/[0.04] border-white/[0.08] active:bg-white/[0.08]',
);

interface MobileMenuGridProps {
  /** Rail rows to show, already filtered by the menu search. */
  items: NavItem[];
  /** True while a search query is typed: feed tiles drop out and order is by rank. */
  searching: boolean;
  currentPath: string;
  notificationCount: number;
  onNavigate: () => void;
}

export function MobileMenuGrid({ items, searching, currentPath, notificationCount, onNavigate }: MobileMenuGridProps) {
  const { t } = useTranslation();
  const onHome = isHomePath(currentPath);

  const isActive = (item: NavItem) =>
    item.path === '/app'
      ? onHome
      : !item.external && !item.action && currentPath.startsWith(item.path);

  const openFeedTab = (tile: FeedTile) => {
    // HomePage reads the stored tab on mount and listens for the switch event
    // while mounted, so whichever state it is in, it lands on this tab.
    try { sessionStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify({ tab: tile.tab })); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(HOME_TAB_SWITCH_EVENT, { detail: tile.tab }));
    window.dispatchEvent(new CustomEvent('home-tab-changed'));
    onNavigate();
  };

  const renderNavTile = (item: NavItem) => {
    const label = t(NAV_LABEL_KEYS[item.label] || item.label);
    const active = isActive(item);
    const body = (
      <TileBody
        label={label}
        iconKey={item.themedIcon ?? NAV_ICON_KEYS[item.label]}
        glyph={item.icon}
        active={active}
        badge={item.path === '/app/notifications' ? notificationCount : undefined}
      />
    );

    if (item.external) {
      return (
        <a key={item.label} href={item.path} target="_blank" rel="noopener noreferrer" onClick={onNavigate} data-menu-tile="idle" className={tileClass(false)}>
          {body}
        </a>
      );
    }
    if (item.action) {
      return (
        <button
          key={item.label}
          type="button"
          onClick={() => { if (item.action === 'open-stages') openStageModal(); onNavigate(); }}
          data-menu-tile="idle" className={tileClass(false)}
        >
          {body}
        </button>
      );
    }
    return (
      <Link
        key={item.label}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => {
          if (item.path === '/app') {
            // Same Home semantics as the rail: first tap on Home scrolls to
            // the top, a second one refreshes (lib/home-nav-intent).
            const intent = resolveHomeNavIntent(onHome);
            if (intent === 'refresh') window.dispatchEvent(new CustomEvent('home-refresh'));
            else if (intent === 'scrollToTop') scrollDocumentToSmooth();
            if (onHome) e.preventDefault();
          }
          onNavigate();
        }}
        onTouchStart={() => preloadRoute(item.path)}
        onFocus={() => preloadRoute(item.path)}
        data-menu-tile={active ? 'active' : 'idle'} className={tileClass(active)}
      >
        {body}
      </Link>
    );
  };

  const renderFeedTile = (tile: FeedTile) => {
    const active = tile.path === '/videos' && currentPath === '/videos';
    return (
      <Link
        key={tile.tab}
        to={tile.path}
        onClick={() => openFeedTab(tile)}
        onTouchStart={() => preloadRoute(tile.path)}
        data-menu-tile={active ? 'active' : 'idle'} className={tileClass(active)}
      >
        <TileBody label={t(tile.labelKey)} iconKey={tile.iconKey} glyph={tile.glyph} active={active} />
      </Link>
    );
  };

  if (searching) {
    return <nav className="grid grid-cols-3 gap-2.5">{items.map(renderNavTile)}</nav>;
  }

  const byLabel = new Map(items.map(item => [item.label, item]));
  const home = byLabel.get('Home');
  const pinned = PINNED_AFTER_FEEDS.map(label => byLabel.get(label)).filter((item): item is NavItem => !!item);
  const pinnedSet = new Set<NavItem>([...(home ? [home] : []), ...pinned]);
  const rest = items.filter(item => !pinnedSet.has(item));
  // Kids Mode strips the rail down to Home and Settings; the feed tabs are
  // still the home feed, so they only show when the full menu does.
  const showFeeds = pinned.length === PINNED_AFTER_FEEDS.length;

  return (
    <nav>
      <div className="grid grid-cols-3 gap-2.5">
        {home && renderNavTile(home)}
        {showFeeds && FEED_TILES.map(renderFeedTile)}
        {pinned.map(renderNavTile)}
      </div>
      {rest.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2.5 border-t border-white/10 pt-2.5">
          {rest.map(renderNavTile)}
        </div>
      )}
    </nav>
  );
}
