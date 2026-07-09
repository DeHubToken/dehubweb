import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
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

  const updateIndicator = useCallback(() => {
    const panel = sidePanelRef.current;
    const active = activeItemEl;
    if (!panel || !active) return;
    const panelRect = panel.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    setIndicatorRect({
      x: activeRect.left - panelRect.left,
      y: activeRect.top - panelRect.top,
      width: activeRect.width,
      height: activeRect.height,
      ready: true,
    });
  }, [activeItemEl]);

  useEffect(() => { updateIndicator(); }, [updateIndicator, isCollapsed]);

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
    if (location.pathname === '/app') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/app');
    }
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

  // Filter out Assistant item - we'll render it specially as a NavLink
  const navItemsWithoutAI = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'Assistant');
  const isAIActive = location.pathname === '/app/assistant';

  // Get user display info for avatar
  const displayName = user?.displayName || user?.username || 'Anonymous';
  const userAvatarUrl = user?.avatarImageUrl && user?.address
    ? buildAvatarUrl(user.address, user.avatarImageUrl)
    : null;

  return (
    <>
      <aside className={cn(
        "hidden lg:flex sticky top-0 h-screen px-2 pb-2 flex-col overflow-hidden items-center transition-[width,padding] duration-500 ease-in-out motion-reduce:transition-none z-0 isolate will-change-[width]",
        isCollapsed ? "w-[60px] pt-[16.5px]" : "w-[60px] pt-[2px] lg:w-[231px] lg:px-[18px] lg:items-stretch lg:pt-0 lg:-mt-[3px]"
      )}>
        {/* Logo & Coin Balance */}
        <div className={cn("relative z-10 flex items-center justify-between w-full", isCollapsed ? "mb-[14px]" : "mb-[14px] lg:mb-[15px]")}>
          <div className={cn("flex items-center", isCollapsed ? "mt-[0.5px] mx-auto" : "mt-[9px] mx-auto lg:mx-0")}>
            <button
              onClick={toggleCollapse}
              className={cn(
                "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors relative -top-[1.5px]",
                isCollapsed ? "hidden" : "hidden lg:flex mr-1.5"
              )}
              aria-label="Toggle sidebar"
            >
              <Menu className="w-[18px] h-[18px] text-zinc-400" />
            </button>
            <button onClick={handleLogoClick} className="block cursor-pointer">
              {isCollapsed ? (
                <img
                  src={isLightTheme ? dehubMarkBlack.url : dehubLogoCompact}
                  alt="dehub"
                  className="h-[22px] w-auto object-contain"
                  decoding="async"
                />
              ) : (
                <img
                  src="/dehub-header-logo.png"
                  alt="dehub"
                  className="h-[40.6px] w-auto object-contain relative -top-[3px]"
                  fetchPriority="high"
                  decoding="async"
                />
              )}
            </button>
            {isCollapsed && (
              <button
                onClick={toggleCollapse}
                className="flex-shrink-0 w-5 h-5 ml-1 flex items-center justify-center rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Expand sidebar"
              >
                <Menu className="w-[14px] h-[14px] text-zinc-400" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Bento - scrollable */}
        <motion.div ref={sidePanelRef} data-side-panel layoutRoot className="relative -mt-[8.5px] bg-zinc-900 rounded-2xl flex-1 min-h-0">
          {/* Active glass overlay indicator - sits above scroll container so shadow is never clipped */}
          {indicatorRect.ready && (
            <motion.div
              data-sidebar-active-indicator
              className={cn(
                "pointer-events-none absolute z-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
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
            const isActive = !item.external && !item.action && location.pathname.startsWith(item.path);
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
                  isHome={false}
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
                  theme={theme}
                />
                {isAssistantAnchor && (
                <NavLink
                  ref={isAIActive ? setActiveItemEl : undefined}
                  to="/app/assistant"
                  className={cn(
                    'relative flex items-center rounded-2xl text-left transition-[font-weight] text-[15px]',
                    desktopNavTextColor,
                    isCollapsed ? 'w-9 h-9 justify-center' : 'w-9 h-9 lg:w-full lg:h-auto justify-center lg:justify-start lg:px-2.5 lg:py-2.5 lg:gap-3',
                    isAIActive ? 'font-semibold' : 'hover:font-semibold'
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
        <div className="mt-3 flex items-center justify-center lg:block px-1">
          <button
            type="button"
            className={cn(
              "cursor-pointer box-border rounded-2xl bg-zinc-900/90 hover:bg-zinc-800/90 transition-colors overflow-hidden shadow-none flex items-center justify-center",
              isMinimal ? "border border-zinc-700" : "border border-white/30",
              isConnecting && "opacity-70 pointer-events-none",
              isCollapsed ? "w-[32px] h-[32px] p-[7px]" : "w-full"
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
      </aside>

      {/* Auth Prompt Dialog */}
      <AuthPrompt 
        isOpen={showAuthPrompt} 
        onClose={() => setShowAuthPrompt(false)}
      />
    </>
  );
}
