import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { isHomePath } from '@/lib/home-path';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PenSquare, Sparkles, LogIn, LogOut, Menu, Search, X, CornerDownLeft } from 'lucide-react';
import { NAV_ITEMS } from '@/constants/app.constants';
import type { NavItem } from '@/types/app.types';
import { SidebarNavItem } from './SidebarNavItem';
import { filterNavItems, exploreSearchHref } from './nav-search';
import { useSearchHistory } from '@/hooks/use-search-history';
import { WarLogo } from '@/components/app/war/WarLogoLazy';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { AuthPrompt } from '../AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { openStageModal } from '@/contexts/StageContext';
import { useAppTheme } from '@/contexts/ThemeContext';

import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { useCommunityActivityUnreadCount } from '@/hooks/use-community-activity-unread';
import { useTotalUnreadCount } from '@/hooks/use-messages';
import dehubLogoCompact from '@/assets/dehub-logo-compact.png';
// Derived from public/brand/mark-black.png, which stays full-resolution because
// the docs Brand Assets page serves it as a download. The rail renders the mark
// at 22x22, so pointing at the download asset shipped a 1920x1645 / 146 KB PNG
// into a 22px box — and, being outside /assets/, without a long cache header.
import dehubMarkBlack from '@/assets/dehub-mark-black.png';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/lib/route-preload';
import { buildAvatarUrl } from '@/lib/media-url';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { leftRailVariants } from '@/lib/surface-motion';
import { scrollDocumentToSmooth } from '@/lib/document-scroll';
import { warmLoginSheet } from '@/components/app/LoginModal';

/**
 * Terminates the rail's nav list. Deliberately NOT in NAV_ITEMS: that array is
 * shared with the mobile drawer, which already ends in its own log-out control,
 * and it is ordered — anything appended there later would land underneath this.
 * Rendered after the map instead, so "last" is structural rather than a position
 * in a list somebody else maintains.
 *
 * `action` is what makes SidebarNavItem render a button rather than a NavLink;
 * the value is only a discriminator, since the handler is passed in.
 */
const LOGOUT_ITEM: NavItem = { icon: LogOut, label: 'Log out', path: '', action: 'logout' };

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, user, walletAddress, connect, isConnecting, needsSignature, disconnect } = useAuth();

  
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const isWarTheme = theme === 'war';
  const isMinimal = theme === 'minimal';
  const desktopNavTextColor = isLightTheme ? 'text-black' : 'text-white';
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: customUnread } = useCustomUnreadCount();
  const totalNotifUnread = (unreadCount?.total ?? 0) + (customUnread ?? 0);
  const { unreadCount: communityActivityUnread } = useCommunityActivityUnreadCount();
  const dmUnread = useTotalUnreadCount();

  // Desktop sidebar active item overlay indicator refs/state
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeItemEl, setActiveItemEl] = useState<HTMLElement | null>(null);
  const [indicatorRect, setIndicatorRect] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });
  const [renderCompactLogo, setRenderCompactLogo] = useState(isCollapsed);
  const logoRevealTimerRef = useRef<number | null>(null);

  // Menu search. The field is not permanent chrome: it stays out of the way
  // until the list is actually being scrolled — i.e. until the user is hunting
  // rather than clicking something they can already see.
  const [navQuery, setNavQuery] = useState('');
  const [navScrolled, setNavScrolled] = useState(false);
  const [navAtBottom, setNavAtBottom] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [bottomSearchFocused, setBottomSearchFocused] = useState(false);
  // Which field the query was typed into. Without it a non-empty query pins
  // both fields open at once.
  const [queryOwner, setQueryOwner] = useState<'top' | 'bottom'>('top');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bottomSearchInputRef = useRef<HTMLInputElement>(null);
  const { addToHistory } = useSearchHistory();

  // `navQuery` and `searchFocused` are not polish here, they are required:
  // filtering shortens the list, which drops the scroll container back to
  // scrollTop 0, which would retract the field mid-keystroke and restore the
  // full list — and then scrollTop is still 0, so it would sit there flickering.
  // Once the field has content or focus it stays regardless of scroll.
  const showSearch = (navScrolled && !navAtBottom) || searchFocused || (navQuery !== '' && queryOwner === 'top');
  // Mirror of the top field, revealed once the list bottoms out.
  const showBottomSearch = navAtBottom || bottomSearchFocused || (navQuery !== '' && queryOwner === 'bottom');

  // Measured in the list's own content coordinates (offsetLeft/offsetTop
  // against the scroll container), not in viewport coordinates. The indicator
  // renders inside the scroller, so content coordinates make it ride with its
  // row for free — nothing to recompute per frame, nothing to lag behind.
  // Viewport coordinates re-targeted the spring on every scroll event, so the
  // glass slid off its row under the wheel and sprang back onto it afterwards.
  const updateIndicator = useCallback(() => {
    const scroller = scrollRef.current;
    const active = activeItemEl;
    if (!scroller || !active) return;
    setIndicatorRect((prev) => {
      const next = {
        x: active.offsetLeft,
        y: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
        ready: true,
      };
      if (prev.ready && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) {
        return prev;
      }
      return next;
    });
  }, [activeItemEl]);

  // navQuery/isAuthenticated: filtering the list, or gaining/losing the
  // signed-in rows, moves the active row without resizing it or the container,
  // so neither the ResizeObserver below nor the scroll handler would notice.
  useEffect(() => { updateIndicator(); }, [updateIndicator, isCollapsed, navQuery, isAuthenticated]);

  // Collapse/expand runs as 500ms CSS transitions (aside width/padding, the
  // layout row's max-width), so the one-shot measurement above captures
  // mid-transition geometry and goes stale once the transition settles —
  // leaving the indicator the wrong width, or overhanging the panel's
  // overflow clip so its right wall disappears. Re-measure on every frame
  // of any panel/item size change, whatever caused it (collapse transitions,
  // theme padding swaps, logo-swap reflows).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateIndicator());
    const panel = sidePanelRef.current;
    if (panel) observer.observe(panel);
    if (activeItemEl) observer.observe(activeItemEl);
    // The scroll container too: it is what the offsets are measured against,
    // and its width drives every row's width in stretch mode.
    if (scrollRef.current) observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [activeItemEl, updateIndicator]);

  useEffect(() => {
    if (logoRevealTimerRef.current !== null) {
      window.clearTimeout(logoRevealTimerRef.current);
      logoRevealTimerRef.current = null;
    }

    if (isCollapsed) {
      setRenderCompactLogo(true);
      return;
    }

    logoRevealTimerRef.current = window.setTimeout(() => {
      setRenderCompactLogo(false);
      logoRevealTimerRef.current = null;
    }, 500);

    return () => {
      if (logoRevealTimerRef.current !== null) {
        window.clearTimeout(logoRevealTimerRef.current);
        logoRevealTimerRef.current = null;
      }
    };
  }, [isCollapsed]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      // No indicator re-measure here: its position is a content coordinate, so
      // scrolling the list moves it and the row it sits on by the same amount.
      // Same 8px threshold the mobile header uses, so a stray wheel tick or a
      // rubber-band does not flick the field in and out.
      setNavScrolled(el.scrollTop > 8);
      // Only when the list actually overflows — a filtered list short enough to
      // fit is trivially "at the bottom" and would reveal both fields at once.
      const overflow = el.scrollHeight - el.clientHeight;
      setNavAtBottom(overflow > 8 && el.scrollTop >= overflow - 8);
    };
    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [navQuery, isCollapsed, isAuthenticated]);

  // A route change re-renders the rail with a different active row; leaving a
  // stale filter applied would hide the page the user just landed on.
  useEffect(() => { setNavQuery(''); }, [location.pathname]);

  // Collapsing hides both the field and the hand-off row (there is no room for
  // either at 60px), so a query left behind would filter the rail down to a few
  // icons with nothing on screen explaining why.
  useEffect(() => { setNavQuery(''); }, [isCollapsed]);

  // Preload both logo variants so collapse/expand swaps are instant
  useEffect(() => {
    [dehubLogoCompact, dehubMarkBlack, '/dehub-header-logo.png'].forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });
  }, []);

  // Get balance from user or default to 0
  const coinBalance = 0; // TODO: Get from user wallet

  const handleCoinClick = () => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return false;
    }
    return true;
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isHomePath(location.pathname)) {
      scrollDocumentToSmooth();
    } else {
      navigate('/app');
    }
  };

  const handleToggleCollapse = () => {
    if (!isCollapsed) {
      setRenderCompactLogo(true);
    }
    toggleCollapse();
  };

  const handlePostClick = async () => {
    if (!isAuthenticated) {
      try {
        await connect();
      } catch {
        // Error is already toasted in AuthContext
      }
      return;
    }
    onPostClick();
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      setShowAuthPrompt(true);
      return;
    }
  };

  // Hover / touch-start on the logged-out CTA warms the login sheet — its
  // first-open mount dance and body chunk land in the hover gap, so the tap
  // itself starts the slide-up on the same frame.
  const warmSheetForLogin = () => {
    if (!isAuthenticated) warmLoginSheet();
  };

  // The rail's own running order. Home is pinned to the top wherever it sits in
  // NAV_ITEMS (it is first in the list now, but the rail keeps owning that), and
  // Assistant is placed directly after Communities because it renders as its own
  // NavLink rather than a SidebarNavItem.
  //
  // Assistant used to be injected inside Communities' render fragment. That is
  // fine for a fixed list and wrong for a filtered one: searching "assistant"
  // filters Communities out, and the Assistant link would have gone with it.
  // Keeping it as a real entry in one ordered array is what makes it findable.
  const railItems = useMemo(() => {
    const home = NAV_ITEMS.find((item) => item.path === '/app');
    const rest = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'Assistant');
    const assistant = NAV_ITEMS.find((item) => item.label === 'Assistant');
    const ordered = home ? [home, ...rest] : [...rest];
    if (assistant) {
      const afterCommunities = ordered.findIndex((item) => item.label === 'Communities');
      ordered.splice(afterCommunities >= 0 ? afterCommunities + 1 : ordered.length, 0, assistant);
    }
    return ordered;
  }, []);

  const visibleRailItems = useMemo(
    () => filterNavItems(railItems, navQuery, t),
    [railItems, navQuery, t],
  );
  const isAIActive = location.pathname === '/app/assistant';

  const runFullSearch = useCallback(() => {
    const query = navQuery.trim();
    if (!query) return;
    addToHistory(query);
    navigate(exploreSearchHref(query));
    setNavQuery('');
    searchInputRef.current?.blur();
    bottomSearchInputRef.current?.blur();
  }, [navQuery, addToHistory, navigate]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runFullSearch();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (navQuery) setNavQuery('');
      else (e.currentTarget as HTMLInputElement).blur();
    }
  };

  // Collapsed, the field is a 36px chip the size of a nav icon — there is no
  // room for an input. Tapping it opens the rail and lands the caret in the
  // field that has just appeared.
  const handleCollapsedSearchClick = () => {
    handleToggleCollapse();
    window.setTimeout(() => searchInputRef.current?.focus(), 80);
  };

  // Get user display info for avatar
  const displayName = user?.displayName || user?.username || 'Anonymous';
  const userAvatarUrl = user?.avatarImageUrl && user?.address
    ? buildAvatarUrl(user.address, user.avatarImageUrl)
    : null;

  return (
    <>
      {/* motion.aside inherits the surface transition label (center/exit/enter)
          from SurfaceTransition — this is the left rail that slides OFF to the
          left when opening docs and slides back IN when returning. Desktop-only
          (`hidden lg:flex`), so the x-transform never affects mobile. */}
      <motion.aside
        variants={leftRailVariants}
        className={cn(
        // items-stretch in BOTH modes: the nav bento and the post/login button
        // below it must be exactly as wide as this rail's content box, so they
        // line up on every theme. Under items-center the bento was shrink-to-fit
        // instead, which made its width depend on its own inner padding — and
        // light/minimal strip that padding from [data-side-panel] (index.css),
        // so collapsed it measured 36px there vs 44px everywhere else.
        "hidden lg:flex sticky top-0 h-screen px-2 pb-2 flex-col overflow-hidden items-stretch transition-[width,padding] duration-500 ease-in-out motion-reduce:transition-none z-0 isolate will-change-[width]",
        isCollapsed ? "w-[60px] pt-[16.5px]" : "w-[60px] pt-[2px] lg:w-[231px] lg:px-[18px] lg:pt-0 lg:-mt-[3px]"
      )}>
        {/* Logo & Coin Balance */}
        <div className={cn("relative z-10 flex items-center justify-between w-full", isCollapsed ? "mb-[14px]" : "mb-[14px] lg:mb-[15px]")}>
          <div className={cn("flex items-center", isCollapsed ? "mt-[0.5px] mx-auto" : "mt-[9px] mx-auto lg:mx-0")}>
            <button
              onPointerDown={() => {
                if (!isCollapsed) setRenderCompactLogo(true);
              }}
              onClick={handleToggleCollapse}
              className={cn(
                "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors relative -top-[1.5px]",
                isLightTheme ? "hover:bg-zinc-200" : "hover:bg-zinc-800",
                isCollapsed ? "hidden" : "hidden lg:flex mr-1.5"
              )}
              aria-label="Toggle sidebar"
            >
              <Menu className="w-[18px] h-[18px] text-zinc-400" />
            </button>
            <button
              onClick={handleLogoClick}
              className={cn(
                "cursor-pointer flex items-center justify-center overflow-hidden",
                renderCompactLogo ? "w-[28px] h-[24px]" : "w-[135px] h-[42px]"
              )}
            >
              {isWarTheme ? (
                <>
                  <WarLogo
                    src={dehubLogoCompact}
                    alt="dehub"
                    className={cn("h-[22px] w-[22px]", !renderCompactLogo && "hidden")}
                  />
                  <WarLogo
                    src="/dehub-header-logo.png"
                    alt="dehub"
                    className={cn("h-[40.6px] w-[135px] relative -top-[3px]", renderCompactLogo && "hidden")}
                  />
                </>
              ) : (
                <>
                  <img
                    src={isLightTheme ? dehubMarkBlack : dehubLogoCompact}
                    alt="dehub"
                    className={cn("h-[22px] w-[22px] object-contain", !renderCompactLogo && "hidden")}
                    decoding="async"
                  />
                  <img
                    src="/dehub-header-logo.png"
                    alt="dehub"
                    className={cn("h-[40.6px] w-[135px] object-contain relative -top-[3px]", renderCompactLogo && "hidden")}
                    fetchPriority="high"
                    decoding="async"
                  />
                </>
              )}
            </button>
            {isCollapsed && (
              <button
                onClick={handleToggleCollapse}
                className={cn(
                  "flex-shrink-0 w-5 h-5 ml-1 flex items-center justify-center rounded-md transition-colors",
                  isLightTheme ? "hover:bg-zinc-200" : "hover:bg-zinc-800"
                )}
                aria-label="Expand sidebar"
              >
                <Menu className="w-[14px] h-[14px] text-zinc-400" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Bento - scrollable */}
        <motion.div ref={sidePanelRef} data-side-panel layoutRoot className="relative -mt-[8.5px] bg-zinc-900 rounded-2xl flex-1 min-h-0 overflow-hidden contain-paint flex flex-col">
          {/* Menu search — revealed by scrolling the list, retracted when it
              returns to the top. Animated through grid-template-rows so the
              row's own height decides the travel; no hardcoded pixel value to
              drift when a theme changes the field's padding. */}
          <div
            className={cn(
              "relative z-10 grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
              showSearch ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            style={{ gridTemplateRows: showSearch ? '1fr' : '0fr' }}
            aria-hidden={!showSearch}
          >
            <div className="overflow-hidden">
              <div className={cn("p-1 pb-0", !isCollapsed && "lg:px-2.5 lg:pt-2.5")}>
                {isCollapsed ? (
                  <button
                    type="button"
                    onClick={handleCollapsedSearchClick}
                    tabIndex={showSearch ? 0 : -1}
                    aria-label={t('sidebar.searchMenu')}
                    className={cn(
                      "w-9 h-9 mx-auto rounded-xl flex items-center justify-center transition-colors",
                      isLightTheme
                        ? "bg-black/5 border border-black/10 hover:bg-black/10"
                        : "bg-white/5 border border-white/10 hover:bg-white/10"
                    )}
                  >
                    <Search className="w-[18px] h-[18px] text-zinc-400" />
                  </button>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={navQuery}
                      onChange={(e) => setNavQuery(e.target.value)}
                      onFocus={() => { setSearchFocused(true); setQueryOwner('top'); }}
                      onBlur={() => setSearchFocused(false)}
                      onKeyDown={handleSearchKeyDown}
                      tabIndex={showSearch ? 0 : -1}
                      placeholder={t('sidebar.searchMenu')}
                      aria-label={t('sidebar.searchMenu')}
                      className={cn(
                        "w-full h-[38px] pl-9 pr-8 rounded-xl text-[14px] outline-none transition-colors",
                        desktopNavTextColor,
                        isLightTheme
                          ? "bg-black/5 border border-black/10 placeholder:text-zinc-500 focus:border-black/25"
                          : "bg-white/5 border border-white/10 placeholder:text-zinc-500 focus:border-white/30"
                      )}
                    />
                    {navQuery && (
                      <button
                        type="button"
                        onClick={() => { setNavQuery(''); searchInputRef.current?.focus(); }}
                        aria-label={t('sidebar.clearSearch')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <X className="w-[14px] h-[14px]" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            ref={scrollRef}
            className={cn(
              // overscroll-contain: without it, reaching the end of the nav list
              // chains the wheel to the document and the feed scrolls out from
              // under the cursor while the user is still working the sidebar.
              // relative: the containing block the active-row glass below is
              // positioned against, and the offsetParent its coordinates are
              // measured from. The two have to be the same box.
              "relative p-1 flex flex-col overflow-y-auto overscroll-contain overflow-x-hidden scrollbar-invisible flex-1 min-h-0",
              !isCollapsed && "lg:p-2.5"
            )}
          >
          {/* Active glass overlay indicator — an absolute child of the scroll
              container, so it is laid out in the list's own scrollable content
              and rides its row exactly, with no per-frame JS in the scroll path
              and no spring chasing a moving target. The container's overflow
              clips it at the list's real edges, so it can no longer float up
              over the menu-search field or down past the last row; mid-list it
              still bleeds freely around its item for the shadow. */}
          {/* activeItemEl guard: filtering can take the active row out of the
              list, and updateIndicator bails when there is nothing to measure —
              which would otherwise leave the glass frozen over whatever row has
              since slid into that slot. */}
          {indicatorRect.ready && activeItemEl && (
            <motion.div
              data-sidebar-active-indicator
              className={cn(
                "pointer-events-none absolute left-0 top-0 z-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30",
                isLightTheme
                  ? "shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(255,255,255,0.06)]"
                  : "shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
                isCollapsed ? 'rounded-xl' : 'rounded-2xl'
              )}
              initial={false}
              animate={{
                x: indicatorRect.x,
                y: indicatorRect.y,
                width: indicatorRect.width,
                height: indicatorRect.height,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {/* Rows live one level in, so `space-y` never lands a stray margin on
              the absolutely-positioned glass above. */}
          <div className={cn(
            "flex flex-col space-y-2 items-center",
            !isCollapsed && "lg:space-y-[2px] lg:items-stretch"
          )}>
          {visibleRailItems.map((item) => {
            if (item.label === 'Assistant') {
              return (
                <NavLink
                  key={item.label}
                  ref={isAIActive ? setActiveItemEl : undefined}
                  to="/app/assistant"
                  onPointerEnter={() => preloadRoute('/app/assistant')}
                  onTouchStart={() => preloadRoute('/app/assistant')}
                  onFocus={() => preloadRoute('/app/assistant')}
                  className={cn(
                    'relative flex items-center rounded-2xl text-left text-[15px]',
                    isLightTheme ? 'transition-[font-weight]' : 'transition-colors',
                    desktopNavTextColor,
                    isCollapsed ? 'w-9 h-9 justify-center' : 'w-9 h-9 lg:w-full lg:h-auto justify-center lg:justify-start lg:px-2.5 lg:py-2.5 lg:gap-3',
                    isAIActive ? 'font-semibold' : isLightTheme ? 'hover:font-semibold' : 'hover:bg-zinc-800/50'
                  )}
                >
                  <div className={cn(
                    "relative z-10 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                    isAIActive ? "bg-transparent" : isCollapsed ? "bg-transparent" : "lg:bg-zinc-800 bg-transparent"
                  )}>
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <span className={cn("relative z-10 truncate", isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.assistant')}</span>
                </NavLink>
              );
            }

            const isHomeItem = item.path === '/app';
            const isActive = !item.external && !item.action && (
              isHomeItem
                ? isHomePath(location.pathname)
                : location.pathname.startsWith(item.path)
            );
            const isProfileItem = item.label === 'Profile';
            const isNotificationsItem = item.label === 'Notifications';
            const isCommunitiesItem = item.label === 'Communities';
            const isMessagesItem = item.label === 'Messages';
            const isStagesItem = item.action === 'open-stages';

            return (
              <SidebarNavItem
                key={item.label}
                item={item}
                isActive={isActive}
                isHome={isHomeItem}
                currentPath={location.pathname}
                variant="desktop"
                collapsed={true}
                forceCollapsed={isCollapsed}
                onClick={isStagesItem ? () => openStageModal() : isProfileItem ? handleProfileClick : undefined}
                avatarUrl={isProfileItem && isAuthenticated ? userAvatarUrl : undefined}
                avatarFallback={isProfileItem && isAuthenticated ? displayName.charAt(0).toUpperCase() : undefined}
                notificationCount={isNotificationsItem ? totalNotifUnread : isCommunitiesItem ? communityActivityUnread : isMessagesItem ? dmUnread : undefined}
                layoutId={isCollapsed ? 'sidebar-nav-collapsed' : 'sidebar-nav-expanded'}
                registerActiveRef={isActive ? setActiveItemEl : undefined}
              />
            );
          })}
          {navQuery && visibleRailItems.length === 0 && !isCollapsed && (
            <p className="px-2.5 py-3 text-[13px] text-zinc-500">{t('sidebar.noMenuMatches')}</p>
          )}
          {/* Always the last thing in the rail. Three conditions, each for its
              own reason:

              Only when there is a session to end — signed out, the rail's
              primary CTA below already reads "Log in", and a Log out above it
              would be offering to undo nothing.

              Only when nothing is typed in the menu search. The list above is
              then the filter's results, and an item that matched no query has
              no business sitting among them; the hand-off row marks the end
              instead, which is why the bottom fade is suppressed there too.

              The trailing spacer lifts it clear of that fade — 80px of
              near-opaque zinc, which half-erases whatever rests under it.
              Acceptable for the last nav destination, not for the one control
              here that ends a session. */}
          {isAuthenticated && !navQuery && (
            <>
              <SidebarNavItem
                item={LOGOUT_ITEM}
                isActive={false}
                isHome={false}
                currentPath={location.pathname}
                variant="desktop"
                collapsed={true}
                forceCollapsed={isCollapsed}
                onClick={() => { void disconnect(); }}
                layoutId={isCollapsed ? 'sidebar-nav-collapsed' : 'sidebar-nav-expanded'}
              />
              {/* Only while the fade is actually over the list. Once the list
                  bottoms out the fade is gone and the bottom search field is
                  the end of the panel, so this would be dead space. Removing it
                  while pinned to the bottom cannot un-pin the scroll, so there
                  is no flicker back and forth. */}
              {!navAtBottom && <div aria-hidden className="h-14 flex-shrink-0" />}
            </>
          )}
          </div>
          </div>
          {/* Hand-off. Always the last thing in the panel while a query is
              typed, so the field is never a dead end: whatever was typed can be
              run as a real search on Explore. */}
          {navQuery && !isCollapsed && (
            <button
              type="button"
              onClick={runFullSearch}
              className={cn(
                "relative z-20 flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] border-t transition-colors",
                isLightTheme
                  ? "border-black/10 text-zinc-600 hover:text-black hover:bg-black/5"
                  : "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{t('sidebar.searchDehubFor', { query: navQuery.trim() })}</span>
              <CornerDownLeft className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-60" />
            </button>
          )}
          {/* Menu search, bottom mirror — revealed once the list bottoms out,
              so the field is in reach at either end of a 28-item rail. Same
              grid-rows collapse as the top one, and it is the last thing in the
              panel, so there is nothing under it. */}
          {!isCollapsed && (
            <div
              className={cn(
                "relative z-20 grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                showBottomSearch ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              style={{ gridTemplateRows: showBottomSearch ? '1fr' : '0fr' }}
              aria-hidden={!showBottomSearch}
            >
              <div className="overflow-hidden">
                <div className="p-1 pt-0 lg:px-2.5 lg:pb-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      ref={bottomSearchInputRef}
                      type="text"
                      value={navQuery}
                      onChange={(e) => setNavQuery(e.target.value)}
                      onFocus={() => { setBottomSearchFocused(true); setQueryOwner('bottom'); }}
                      onBlur={() => setBottomSearchFocused(false)}
                      onKeyDown={handleSearchKeyDown}
                      tabIndex={showBottomSearch ? 0 : -1}
                      placeholder={t('sidebar.searchMenu')}
                      aria-label={t('sidebar.searchMenu')}
                      className={cn(
                        "w-full h-[38px] pl-9 pr-8 rounded-xl text-[14px] outline-none transition-colors",
                        desktopNavTextColor,
                        isLightTheme
                          ? "bg-black/5 border border-black/10 placeholder:text-zinc-500 focus:border-black/25"
                          : "bg-white/5 border border-white/10 placeholder:text-zinc-500 focus:border-white/30"
                      )}
                    />
                    {navQuery && (
                      <button
                        type="button"
                        onClick={() => { setNavQuery(''); bottomSearchInputRef.current?.focus(); }}
                        aria-label={t('sidebar.clearSearch')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <X className="w-[14px] h-[14px]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Bottom fade overlay — suppressed while filtering, where the list is
              short and the hand-off row marks the end instead, and at the bottom
              of the list, where there is nothing left to hint at. */}
          {!navQuery && !navAtBottom && (
            <div data-sidebar-fade className={cn("pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent rounded-b-2xl z-10")} />
          )}
        </motion.div>

        {/* Post / Login Button — w-full with no side padding so the button's box
            is the rail's content box, i.e. identical to the nav bento above it
            in both collapsed and expanded mode, on every theme. */}
        <div className="mt-3 w-full">
          <button
            type="button"
            /* The rail's primary action. Tagged so themes can treat it as one:
               untagged, it read as a second anonymous slab welded under the nav
               bento, at nearly the same width and the same fill. */
            data-primary-cta
            className={cn(
              "cursor-pointer box-border rounded-2xl bg-zinc-900/90 hover:bg-zinc-800/90 transition-colors overflow-hidden shadow-none flex items-center justify-center",
              isMinimal ? "border border-zinc-700" : "border border-white/30",
              isConnecting && "opacity-70 pointer-events-none",
              isCollapsed ? "w-full h-[44px] p-[7px]" : "w-full"
            )}
            onClick={handlePostClick}
            onPointerDown={warmSheetForLogin}
            onMouseEnter={warmSheetForLogin}
            disabled={isConnecting}
          >
            <div className={cn(
              "flex items-center gap-2 font-semibold text-white justify-center",
              isCollapsed ? "text-[13.5px]" : "py-[7px] lg:py-3 text-[13.5px]"
            )}>
              {isAuthenticated ? (
                 <>
                    <PenSquare className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={cn(isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.create')}</span>
                 </>
              ) : isConnecting ? (
                 <>
                    <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                    <span className={cn("whitespace-nowrap", isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.connecting')}</span>
                 </>
              ) : needsSignature ? (
                 <>
                    <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={cn("whitespace-nowrap", isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.signMessage')}</span>
                 </>
              ) : (
                 <>
                    <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={cn("whitespace-nowrap", isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.login')}</span>
                 </>
              )}
            </div>
          </button>
        </div>
      </motion.aside>

      {/* Auth Prompt Dialog */}
      <AuthPrompt 
        isOpen={showAuthPrompt} 
        onClose={() => setShowAuthPrompt(false)}
      />
    </>
  );
}
