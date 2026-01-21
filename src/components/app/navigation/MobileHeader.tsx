import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import dehubLogo from '@/assets/dehub-logo-white.png';

interface MobileHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function MobileHeader({ isOpen, onToggle, children }: MobileHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  // TODO: Replace with actual balance from auth/wallet state
  const coinBalance = 0;

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname.startsWith('/app')) {
      window.dispatchEvent(new CustomEvent('home-refresh'));
    }
    navigate('/app');
  };

  const isNotificationsActive = location.pathname === '/app/notifications';

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 py-2 flex items-center justify-between after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-black after:translate-y-full">
      <div className="flex items-center gap-3">
        <button onClick={handleLogoClick} className="block cursor-pointer">
          <img src={dehubLogo} alt="dehub" className="h-6 md:h-7 w-auto" />
        </button>
        
        {/* Authenticated User Avatar & Name */}
        {isAuthenticated && user && (
          <button 
            onClick={() => navigate('/app/profile')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Avatar className="w-7 h-7">
              <AvatarImage
                src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username || user.wallet_address}`}
                alt={`${user.display_name || user.username}'s avatar`}
                className="object-cover"
              />
              <AvatarFallback className="bg-zinc-700 text-white text-xs">
                {(user.display_name || user.username)?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-white font-medium truncate max-w-[80px]">
              {user.display_name || user.username || 'User'}
            </span>
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {/* Coin Balance */}
        <CoinBalanceMenu balance={coinBalance} variant="mobile" />
        
        {/* Notifications Button */}
        <button
          onClick={() => navigate('/app/notifications')}
          className={`p-2 rounded-full transition-colors ${isNotificationsActive ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>
        
        {/* Menu Button */}
        <Drawer open={isOpen} onOpenChange={onToggle}>
          <DrawerTrigger asChild>
            <button
              className="p-2 rounded-full transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6 text-zinc-400" />
            </button>
          </DrawerTrigger>
          <DrawerContent glass className="max-h-[85vh]">
            <div className="p-4 pb-8 overflow-y-auto">
              {children}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </header>
  );
}
