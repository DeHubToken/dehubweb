import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
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
 * Four columns of glossy 3D icons, the same per-theme artwork the feed tabs
 * and empty states use (public/theme-icons/<theme>/<key>.webp), so the sheet
 * reskins with the theme for free. Every rail row maps to a piece of that set:
 * a flat glyph beside the glossy renders reads as a broken tile, so the glyph
 * is only the fallback for artwork that fails to load.
 */

// Rail row → artwork. Rows without a bespoke render borrow the closest one.
const NAV_ICON_KEYS: Record<string, ThemeIconKey> = {
  Home: 'home', Profile: 'profile', Explore: 'search', Notifications: 'notifications',
  Messages: 'messages', Arcade: 'arcade', Apps: 'stores', Communities: 'communities', Assistant: 'assistant',
  Settings: 'settings', Stages: 'stages', Bookmarks: 'bookmarks', Command: 'command',
  Events: 'events', Leaderboard: 'trophy', 'Feature Requests': 'features', Staking: 'staking',
  SuperPowers: 'superpowers', Governance: 'governance', DAO: 'dao', Bounties: 'bounties',
  Careers: 'careers', Stores: 'stores', Fractions: 'fractions', Usernames: 'usernames',
  Accounts: 'accounts', Advertising: 'ads', 'Live TV': 'tv', Prompt: 'wand',
  Glossary: 'glossary', Stats: 'stats', 'Buy Tokens': 'buy', Bridge: 'bridge',
  Wallet: 'buy', Affiliate: 'subscriptions', Converter: 'videos', Migrate: 'bridge',
  Guide: 'pinned', Docs: 'posts', Blog: 'email',
};

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
      <span className="relative flex h-[44px] w-[44px] items-center justify-center">
        {iconKey && !artFailed ? (
          <ThemedIcon
            icon={iconKey}
            alt=""
            className="h-[44px] w-[44px] object-contain"
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
      <span className={cn('w-full truncate text-center text-[11.5px] leading-tight', active ? 'font-semibold text-white' : 'font-medium text-zinc-200')}>
        {label}
      </span>
    </>
  );
}

const tileClass = (active: boolean) => cn(
  'flex flex-col items-center justify-center gap-1.5 rounded-[14px] px-1 py-2.5 min-h-[84px] border transition-colors',
  active
    ? 'bg-white/[0.12] border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
    : 'bg-white/[0.04] border-white/[0.08] active:bg-white/[0.08]',
);

interface MobileMenuGridProps {
  /** Rail rows to show, already filtered by the menu search. */
  items: NavItem[];
  /** True while a search query is typed: order is by rank. */
  searching?: boolean;
  currentPath: string;
  notificationCount: number;
  onNavigate: () => void;
}

export function MobileMenuGrid({ items, currentPath, notificationCount, onNavigate }: MobileMenuGridProps) {
  const { t } = useTranslation();
  const onHome = isHomePath(currentPath);

  const isActive = (item: NavItem) =>
    item.path === '/app'
      ? onHome
      : !item.external && !item.action && currentPath.startsWith(item.path);

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

  // Same order as the desktop rail, one continuous grid.
  return <nav className="grid grid-cols-4 gap-2">{items.map(renderNavTile)}</nav>;
}
