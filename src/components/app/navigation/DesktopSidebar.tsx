import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { isHomePath } from '@/lib/home-path';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PenSquare, Sparkles, LogIn, Menu } from 'lucide-react';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { AuthPrompt } from '../AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useStage } from '@/contexts/StageContext';
import { useAppTheme } from '@/contexts/ThemeContext';

import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { useCommunityActivityUnreadCount } from '@/hooks/use-community-activity-unread';
import { useTotalUnreadCount } from '@/hooks/use-messages';
import dehubLogoCompact from '@/assets/dehub-logo-compact.png';
import dehubMarkBlack from '@/assets/design-system/mark-black.png.asset.json';
import { cn } from '@/lib/utils';
import { buildAvatarUrl } from '@/lib/media-url';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { leftRailVariants } from '@/lib/surface-motion';

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, user, walletAddress, connect, isConnecting, needsSignature } = useAuth();
  const { openModal: openStagesModal } = useStage();
  
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
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

  const updateIndicator = useCallback(() => {
    const panel = sidePanelRef.current;
    const active = activeItemEl;
    if (!panel || !active) return;
    const panelRect = panel.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    setIndicatorRect((prev) => {
      const next = {
        x: activeRect.left - panelRect.left,
        y: activeRect.top - panelRect.top,
        width: activeRect.width,
        height: activeRect.height,
        ready: true,
      };
      if (prev.ready && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) {
        return prev;
      }
      return next;
    });
  }, [activeItemEl]);

  useEffect(() => { updateIndicator(); }, [updateIndicator, isCollapsed]);

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
    const handleScroll = () => requestAnimationFrame(updateIndicator);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [updateIndicator]);

  // Preload both logo variants so collapse/expand swaps are instant
  useEffect(() => {
    [dehubLogoCompact, dehubMarkBlack.url, '/dehub-header-logo.png'].forEach((src) => {
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // Filter out Assistant item - we'll render it specially as a NavLink.
  // Also pull Home out of its default position and prepend it above Profile.
  const homeItem = NAV_ITEMS.find((item) => item.path === '/app');
  const nonHomeItems = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'Assistant');
  const navItemsWithoutAI = homeItem ? [homeItem, ...nonHomeItems] : nonHomeItems;
  const isAIActive = location.pathname === '/app/assistant';

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
        "hidden lg:flex sticky top-0 h-screen px-2 pb-2 flex-col overflow-hidden items-center transition-[width,padding] duration-500 ease-in-out motion-reduce:transition-none z-0 isolate will-change-[width]",
        isCollapsed ? "w-[60px] pt-[16.5px]" : "w-[60px] pt-[2px] lg:w-[231px] lg:px-[18px] lg:items-stretch lg:pt-0 lg:-mt-[3px]"
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
              <img
                src={isLightTheme ? dehubMarkBlack.url : dehubLogoCompact}
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
        <motion.div ref={sidePanelRef} data-side-panel layoutRoot className="relative -mt-[8.5px] bg-zinc-900 rounded-2xl flex-1 min-h-0 overflow-hidden contain-paint">
          {/* Active glass overlay indicator - tracks the active item's on-screen
              position (via getBoundingClientRect, which is always current, so it
              naturally follows scrolling). Clipped at this panel's own edges —
              matching where the scrollable list visually starts/ends — so it cuts
              off at top/bottom like the text instead of floating past it, while
              still bleeding freely around each item mid-list for the shadow. */}
          {indicatorRect.ready && (
            <motion.div
              data-sidebar-active-indicator
              className={cn(
                "pointer-events-none absolute z-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30",
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
          <div
            ref={scrollRef}
            className={cn(
              "p-1 space-y-2 flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-invisible h-full",
              !isCollapsed && "lg:p-2.5 lg:space-y-[2px] lg:items-stretch"
            )}
          >
          {navItemsWithoutAI.map((item) => {
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
            const isAssistantAnchor = item.label === 'Communities';
            const isStagesItem = item.action === 'open-stages';

            return (
              <React.Fragment key={item.label}>
                <SidebarNavItem
                  item={item}
                  isActive={isActive}
                  isHome={isHomeItem}
                  currentPath={location.pathname}
                  variant="desktop"
                  collapsed={true}
                  forceCollapsed={isCollapsed}
                  onClick={isStagesItem ? () => openStagesModal() : isProfileItem ? handleProfileClick : undefined}
                  avatarUrl={isProfileItem && isAuthenticated ? userAvatarUrl : undefined}
                  avatarFallback={isProfileItem && isAuthenticated ? displayName.charAt(0).toUpperCase() : undefined}
                  notificationCount={isNotificationsItem ? totalNotifUnread : isCommunitiesItem ? communityActivityUnread : isMessagesItem ? dmUnread : undefined}
                  layoutId={isCollapsed ? 'sidebar-nav-collapsed' : 'sidebar-nav-expanded'}
                  registerActiveRef={isActive ? setActiveItemEl : undefined}
                />
                {isAssistantAnchor && (
                <NavLink
                  ref={isAIActive ? setActiveItemEl : undefined}
                  to="/app/assistant"
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
                )}
              </React.Fragment>
            );
          })}
          </div>
          {/* Bottom fade overlay */}
          <div data-sidebar-fade className={cn("pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent rounded-b-2xl z-10")} />
        </motion.div>

        {/* Post / Login Button */}
        <div className={cn("mt-3 flex items-center lg:block", isCollapsed ? "px-0 justify-center" : "px-1 justify-center")}>
          <button
            type="button"
            className={cn(
              "cursor-pointer box-border rounded-2xl bg-zinc-900/90 hover:bg-zinc-800/90 transition-colors overflow-hidden shadow-none flex items-center justify-center",
              isMinimal ? "border border-zinc-700" : "border border-white/30",
              isConnecting && "opacity-70 pointer-events-none",
              isCollapsed ? "w-full h-[44px] p-[7px]" : "w-full"
            )}
            onClick={handlePostClick}
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
                    <span className={cn(isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.connecting')}</span>
                 </>
              ) : needsSignature ? (
                 <>
                    <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={cn(isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.signMessage')}</span>
                 </>
              ) : (
                 <>
                    <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={cn(isCollapsed ? "hidden" : "hidden lg:inline")}>{t('nav.login')}</span>
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
