import { useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { PenSquare, Sparkles, LogOut, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { AuthPrompt } from '../AuthPrompt';
import { UserAvatar } from '../UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, walletAddress, disconnect } = useAuth();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Get balance from user or default to 0
  const coinBalance = 0; // TODO: Get from user wallet

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname.startsWith('/app')) {
      window.dispatchEvent(new CustomEvent('home-refresh'));
    }
    navigate('/app');
  };

  const handlePostClick = () => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
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

  const handleCoinClick = () => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return false;
    }
    return true;
  };

  const handleSignInClick = () => {
    setShowAuthPrompt(true);
  };

  const handleLogout = async () => {
    try {
      await disconnect();
      setShowUserMenu(false);
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  // Filter out Assistant item - we'll render it specially as a NavLink
  const navItemsWithoutAI = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'Assistant');
  const isAIActive = location.pathname === '/app/assistant';

  // Get user display info
  const displayName = user?.displayName || user?.username || 'Anonymous';
  const username = user?.username || (walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '');

  return (
    <>
      <aside className="hidden lg:flex sticky top-0 h-screen w-[231px] p-[18px] flex-col overflow-y-auto scrollbar-invisible">
        {/* Logo & Coin Balance */}
        <div className="mb-6 flex items-center justify-between">
          <button onClick={handleLogoClick} className="block cursor-pointer">
            <img src={dehubLogo} alt="dehub" className="h-[46.2px] w-auto" />
          </button>
          <CoinBalanceMenu 
            balance={coinBalance} 
            variant="desktop" 
            onAuthRequired={handleCoinClick}
          />
        </div>

        {/* Navigation Bento - reduced padding */}
        <div className="bg-zinc-900 rounded-2xl p-2.5 space-y-[2px]">
          {navItemsWithoutAI.map((item) => {
            const isActive = !item.external && location.pathname.startsWith(item.path);
            const isProfileItem = item.label === 'Profile';
            
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
                />
                {isAfterMessages && (
                  <NavLink
                    to="/app/assistant"
                    className={cn(
                      'flex items-center gap-3 w-full px-2.5 py-2.5 rounded-xl text-left transition-colors text-[13.5px]',
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
            className="w-full rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 font-semibold py-5 text-[13.5px] gap-2"
          >
            <PenSquare className="w-[18px] h-[18px]" />
            Post
          </Button>
        </div>

        {/* Spacer to push auth section to bottom */}
        <div className="flex-1" />

        {/* Auth/Profile Section at bottom */}
        <div className="mt-3 bg-zinc-900 rounded-2xl p-2.5">
          {isAuthenticated ? (
            <Popover open={showUserMenu} onOpenChange={setShowUserMenu}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-zinc-800/50 transition-colors text-left">
                  <UserAvatar
                    name={displayName}
                    handle={username}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[13px] font-medium truncate">{displayName}</p>
                    <p className="text-zinc-400 text-[11px] truncate">@{username}</p>
                  </div>
                  <ChevronUp className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-[195px] p-2 bg-zinc-900 border-zinc-800" 
                align="start" 
                side="top"
                sideOffset={8}
              >
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:bg-zinc-800 transition-colors text-[13px]"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log out</span>
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <Button 
              onClick={handleSignInClick}
              variant="outline"
              className="w-full rounded-xl border-zinc-700 bg-transparent text-white hover:bg-zinc-800 hover:text-white font-semibold py-5 text-[13.5px]"
            >
              Sign in
            </Button>
          )}
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
