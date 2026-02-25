import React, { useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PenSquare, Sparkles, LogIn, Menu } from 'lucide-react';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { AuthPrompt } from '../AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useCoinPlacement } from '@/hooks/use-coin-placement';
import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import dehubLogo from '@/assets/dehub-logo-white.png';
import dehubLogoCompact from '@/assets/dehub-logo-compact.png';
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
  const { stickToBanner } = useCoinPlacement();
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const { data: unreadCount } = useUnreadNotificationCount();

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
    
    if (isCollapsed) {
      // In full-screen mode, clicking logo re-expands the sidebar
      toggleCollapse();
      return;
    }
    
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
        isCollapsed ? "w-[60px] pt-[2px]" : "w-[60px] pt-[2px] xl:w-[231px] xl:px-[18px] xl:items-stretch xl:pt-0 xl:-mt-[3px]"
      )}>
        {/* Logo & Coin Balance */}
        <div className={cn("flex items-center justify-between w-full", isCollapsed ? "mb-6" : "mb-6 xl:mb-3")}>
          <div className={cn("flex items-center mt-[10px]", isCollapsed ? "mx-auto" : "mx-auto xl:mx-0")}>
            <button
              onClick={toggleCollapse}
              className={cn(
                "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors",
                isCollapsed ? "hidden" : "hidden xl:flex mr-1.5"
              )}
              aria-label="Toggle sidebar"
            >
              <Menu className="w-[18px] h-[18px] text-zinc-400" />
            </button>
            <button onClick={handleLogoClick} className="block cursor-pointer">
              <img src={dehubLogo} alt="dehub" className={cn("h-[50.8px] w-auto relative -top-[3px]", isCollapsed ? "hidden" : "hidden xl:block")} />
              <img src={dehubLogoCompact} alt="dehub" className={cn("h-[32px] w-auto", isCollapsed ? "block" : "xl:hidden")} />
            </button>
          </div>
          {isAuthenticated && stickToBanner && (
            <div className={cn("mt-[10px]", isCollapsed ? "hidden" : "hidden xl:block")}>
              <CoinBalanceMenu 
                balance={coinBalance} 
                variant="desktop" 
                onAuthRequired={handleCoinClick}
              />
            </div>
          )}
        </div>

        {/* Navigation Bento - scrollable */}
        <div className="relative -mt-[8.5px] bg-zinc-900 rounded-2xl flex-1 min-h-0">
          <div className={cn(
            "p-1 space-y-2 flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-invisible h-full",
            !isCollapsed && "xl:p-2.5 xl:space-y-[2px] xl:items-stretch"
          )}>
          {navItemsWithoutAI.map((item) => {
            const isActive = !item.external && location.pathname.startsWith(item.path);
            const isProfileItem = item.label === 'Profile';
            const isNotificationsItem = item.label === 'Notifications';
            const isAfterMessages = item.label === 'Messages';

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
                  onClick={isProfileItem ? handleProfileClick : undefined}
                  avatarUrl={isProfileItem && isAuthenticated ? userAvatarUrl : undefined}
                  avatarFallback={isProfileItem && isAuthenticated ? displayName.charAt(0).toUpperCase() : undefined}
                  notificationCount={isNotificationsItem ? unreadCount?.total : undefined}
                  layoutId={isCollapsed ? 'sidebar-nav-collapsed' : 'sidebar-nav-expanded'}
                />
                {isAfterMessages && (
                  <NavLink
                    to="/app/assistant"
                    className={cn(
                      'relative flex items-center rounded-xl text-left transition-colors text-[15px] text-white',
                      isCollapsed ? 'w-9 h-9 justify-center' : 'w-9 h-9 xl:w-full xl:h-auto justify-center xl:justify-start xl:px-2.5 xl:py-2.5 xl:gap-3',
                      isAIActive ? 'font-semibold' : 'hover:bg-zinc-800/50'
                    )}
                  >
                    {isAIActive && (
                      <motion.div
                        key={isCollapsed ? 'sidebar-nav-collapsed' : 'sidebar-nav-expanded'}
                        layoutId={isCollapsed ? 'sidebar-nav-collapsed' : 'sidebar-nav-expanded'}
                        className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <div className={cn(
                      "relative z-10 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                      isAIActive ? "bg-transparent" : isCollapsed ? "bg-transparent" : "xl:bg-zinc-800 bg-transparent"
                    )}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className={cn("relative z-10 truncate", isCollapsed ? "hidden" : "hidden xl:inline")}>{t('nav.assistant')}</span>
                  </NavLink>
                )}
              </React.Fragment>
            );
          })}
          </div>
          {/* Bottom fade overlay */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent rounded-b-2xl z-10" />
        </div>

        {/* Post / Login Button */}
        <div className="mt-3 flex items-center justify-center xl:block">
          <LiquidGlassBubble 
            shimmer
            noBorder
            className={cn("cursor-pointer w-full [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent", isConnecting && "opacity-70 pointer-events-none")}
            onClick={handlePostClick}
          >
            <div className={cn(
              "flex items-center gap-2 font-semibold text-white justify-center",
              isCollapsed ? "py-[7px] text-[13.5px]" : "py-[7px] xl:py-3 text-[13.5px]"
            )}>
              {isAuthenticated ? (
                <>
                   <PenSquare className="w-[18px] h-[18px] flex-shrink-0" />
                   <span className={cn(isCollapsed ? "hidden" : "hidden xl:inline")}>{t('nav.create')}</span>
                </>
              ) : isConnecting ? (
                <>
                   <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                   <span className={cn(isCollapsed ? "hidden" : "hidden xl:inline")}>{t('nav.connecting')}</span>
                </>
              ) : needsSignature ? (
                <>
                   <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                   <span className={cn(isCollapsed ? "hidden" : "hidden xl:inline")}>{t('nav.signMessage')}</span>
                </>
              ) : (
                <>
                   <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                   <span className={cn(isCollapsed ? "hidden" : "hidden xl:inline")}>{t('nav.login')}</span>
                </>
              )}
            </div>
          </LiquidGlassBubble>
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
