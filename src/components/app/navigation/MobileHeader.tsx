import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';

import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { buildAvatarUrl } from '@/lib/media-url';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { useCallback } from 'react';

interface MobileHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function MobileHeader({ isOpen, onToggle, children }: MobileHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, openLoginModal } = useAuth();
  
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: customUnread } = useCustomUnreadCount();
  const totalNotifUnread = (unreadCount?.total ?? 0) + (customUnread ?? 0);

  // Coin balance
  const coinBalance = 0; // TODO: Get from user wallet

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

  const isNotificationsActive = location.pathname === '/app/notifications';
  const handleMenuClick = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
    }
  }, [isAuthenticated, openLoginModal]);

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 h-11 flex items-center justify-between">
      <div className="flex items-center gap-3 ml-[-8px]">
        <button onClick={handleLogoClick} className="block cursor-pointer">
          <img src={dehubLogo} alt="dehub" className="h-7 md:h-7 w-auto" />
        </button>
      </div>
      
      <div className="flex items-center gap-3">
        
        {/* Notifications Button - only visible when logged in */}
        {isAuthenticated && (
          <button
            onClick={() => navigate('/app/notifications')}
            className={`relative flex items-center justify-center transition-colors ${isNotificationsActive ? 'text-white' : 'text-zinc-400'}`}
            aria-label="Notifications"
          >
            <Bell className="w-[26px] h-[26px]" />
            {totalNotifUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full">
                {totalNotifUnread > 99 ? '99+' : totalNotifUnread}
              </span>
            )}
          </button>
        )}
        
        {/* Menu Button - Avatar drawer when authenticated, login prompt when not */}
        {isAuthenticated ? (
          <Drawer open={isOpen} onOpenChange={onToggle}>
            <DrawerTrigger asChild>
              {user ? (
                <button
                  className="hover:opacity-80 transition-opacity"
                  aria-label="Toggle menu"
                >
                  <Avatar className="w-[27px] h-[27px]">
                    {user.avatarImageUrl && user.address && (
                      <AvatarImage
                        src={buildAvatarUrl(user.address, user.avatarImageUrl)}
                        alt={`${user.displayName || user.username}'s avatar`}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
                      {(user.displayName || user.username)?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button
                  className="p-2 rounded-full transition-colors mr-[-16.5px]"
                  aria-label="Toggle menu"
                >
                  <Menu className="w-[31px] h-[31px] text-white" />
                </button>
              )}
            </DrawerTrigger>
            <DrawerContent glass className="max-h-[85vh]">
              <div className="p-4 pb-8 overflow-y-auto">
                {children}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <button
            onClick={handleMenuClick}
            className="p-2 rounded-full transition-colors mr-[-16.5px]"
            aria-label="Log in"
          >
            <Menu className="w-[31px] h-[31px] text-white" />
          </button>
        )}
      </div>
    </header>
  );
}
