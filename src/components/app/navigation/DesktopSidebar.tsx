import { useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { PenSquare, Sparkles, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { AuthPrompt } from '../AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useCoinPlacement } from '@/hooks/use-coin-placement';
import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import dehubLogo from '@/assets/dehub-logo-white.png';
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
      <aside className="hidden lg:flex sticky top-0 h-screen w-[231px] p-[18px] pt-[2px] flex-col overflow-y-auto scrollbar-invisible">
        {/* Logo & Coin Balance (when stickToBanner is enabled) */}
        <div className="mb-6 flex items-center justify-between">
          <button onClick={handleLogoClick} className="block cursor-pointer mt-[10px]">
            <img src={dehubLogo} alt="dehub" className="h-[46.2px] w-auto" />
          </button>
          {stickToBanner && (
            <div className="mt-[10px]">
              <CoinBalanceMenu 
                balance={coinBalance} 
                variant="desktop" 
                onAuthRequired={handleCoinClick}
              />
            </div>
          )}
        </div>

        {/* Navigation Bento - reduced padding */}
        <div className="-mt-[8.5px] bg-zinc-900 rounded-2xl p-2.5 space-y-[2px]">
          {navItemsWithoutAI.map((item) => {
            const isActive = !item.external && location.pathname.startsWith(item.path);
            const isProfileItem = item.label === 'Profile';
            const isNotificationsItem = item.label === 'Notifications';
            
            // Insert AI link after Messages
            const isAfterMessages = item.label === 'Messages';

            return (
              <div key={item.label}>
                <SidebarNavItem
                  item={item}
                  isActive={isActive}
                  isHome={false}
                  currentPath={location.pathname}
                  variant="desktop"
                  onClick={isProfileItem ? handleProfileClick : undefined}
                  // Show user avatar for Profile item when authenticated
                  avatarUrl={isProfileItem && isAuthenticated ? userAvatarUrl : undefined}
                  avatarFallback={isProfileItem && isAuthenticated ? displayName.charAt(0).toUpperCase() : undefined}
                  notificationCount={isNotificationsItem ? unreadCount?.total : undefined}
                />
                {isAfterMessages && (
                  <NavLink
                    to="/app/assistant"
                    className={cn(
                      'flex items-center gap-3 w-full px-2.5 py-2.5 rounded-xl text-left transition-colors text-[15px]',
                      isAIActive
                        ? 'bg-zinc-800 font-semibold text-white'
                        : 'text-white hover:bg-zinc-800/50'
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                      isAIActive ? "bg-zinc-700" : "bg-zinc-800"
                    )}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="truncate">Assistant</span>
                  </NavLink>
                )}
              </div>
            );
          })}
        </div>

        {/* Post Button Bento - reduced padding and button size */}
        <div className="mt-3 bg-zinc-900 rounded-2xl p-2.5">
          <Button 
            onClick={handlePostClick}
            disabled={isConnecting}
            className="w-full rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 font-semibold py-5 text-[13.5px] gap-2 disabled:opacity-70"
          >
            {isAuthenticated ? (
              <>
                <PenSquare className="w-[18px] h-[18px]" />
                Post
              </>
            ) : isConnecting ? (
              <>
                <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting...
              </>
            ) : needsSignature ? (
              <>
                <LogIn className="w-[18px] h-[18px]" />
                Sign message
              </>
            ) : (
              <>
                <LogIn className="w-[18px] h-[18px]" />
                Log in
              </>
            )}
          </Button>
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
