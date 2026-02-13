import { useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { PenSquare, Sparkles, LogIn } from 'lucide-react';
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

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, walletAddress, connect, isConnecting, needsSignature } = useAuth();
  const { stickToBanner } = useCoinPlacement();
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
    
    if (location.pathname === '/app') {
      // Already on home - just scroll to top, don't trigger full refresh
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Coming from another app page - navigate without refresh
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
      <aside className="hidden lg:flex sticky top-0 h-screen w-[60px] xl:w-[231px] px-2 xl:px-[18px] pt-[2px] pb-2 flex-col overflow-y-auto scrollbar-invisible items-center xl:items-stretch transition-all duration-200">
        {/* Logo & Coin Balance */}
        <div className="mb-6 flex items-center justify-between w-full">
          <button onClick={handleLogoClick} className="block cursor-pointer mt-[10px] mx-auto xl:mx-0">
            <img src={dehubLogo} alt="dehub" className="h-[50.8px] w-auto hidden xl:block" />
            <img src={dehubLogoCompact} alt="dehub" className="h-[28px] w-auto xl:hidden" />
          </button>
          {isAuthenticated && stickToBanner && (
            <div className="mt-[10px] hidden xl:block">
              <CoinBalanceMenu 
                balance={coinBalance} 
                variant="desktop" 
                onAuthRequired={handleCoinClick}
              />
            </div>
          )}
        </div>

        {/* Navigation Bento */}
        <div className="-mt-[8.5px] bg-zinc-900 rounded-2xl p-1 xl:p-2.5 space-y-2 xl:space-y-[2px] flex flex-col items-center xl:items-stretch">
          {navItemsWithoutAI.map((item) => {
            const isActive = !item.external && location.pathname.startsWith(item.path);
            const isProfileItem = item.label === 'Profile';
            const isNotificationsItem = item.label === 'Notifications';
            const isAfterMessages = item.label === 'Messages';

            return (
              <div key={item.label} className="w-full flex flex-col items-center xl:items-stretch">
                <SidebarNavItem
                  item={item}
                  isActive={isActive}
                  isHome={false}
                  currentPath={location.pathname}
                  variant="desktop"
                  collapsed={true}
                  onClick={isProfileItem ? handleProfileClick : undefined}
                  avatarUrl={isProfileItem && isAuthenticated ? userAvatarUrl : undefined}
                  avatarFallback={isProfileItem && isAuthenticated ? displayName.charAt(0).toUpperCase() : undefined}
                  notificationCount={isNotificationsItem ? unreadCount?.total : undefined}
                />
                {isAfterMessages && (
                  <NavLink
                    to="/app/assistant"
                    className={cn(
                      'flex items-center rounded-xl text-left transition-colors text-[15px]',
                      'w-9 h-9 xl:w-full xl:h-auto justify-center xl:justify-start xl:px-2.5 xl:py-2.5 xl:gap-3',
                      isAIActive
                        ? 'bg-zinc-800 font-semibold text-white'
                        : 'text-white hover:bg-zinc-800/50'
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                      "xl:w-9 xl:h-9",
                      isAIActive ? "bg-zinc-700" : "xl:bg-zinc-800 bg-transparent"
                    )}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="truncate hidden xl:inline">Assistant</span>
                  </NavLink>
                )}
              </div>
            );
          })}
        </div>

        {/* Post / Login Button */}
        <div className="mt-3 flex items-center justify-center xl:block">
          <LiquidGlassBubble 
            shimmer
            noBorder
            className={cn("cursor-pointer w-full", isConnecting && "opacity-70 pointer-events-none")}
            onClick={handlePostClick}
          >
            <div className={cn(
              "flex items-center gap-2 font-semibold text-white justify-center",
              "py-3 xl:py-4 text-[13.5px]"
            )}>
              {isAuthenticated ? (
                <>
                  <PenSquare className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="hidden xl:inline">Create</span>
                </>
              ) : isConnecting ? (
                <>
                  <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                  <span className="hidden xl:inline">Connecting...</span>
                </>
              ) : needsSignature ? (
                <>
                  <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="hidden xl:inline">Sign message</span>
                </>
              ) : (
                <>
                  <LogIn className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className="hidden xl:inline">Log in</span>
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
