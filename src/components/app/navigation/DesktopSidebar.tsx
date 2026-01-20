import { useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { PenSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { AuthPrompt } from '../AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { cn } from '@/lib/utils';

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

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

  // Filter out Assistant item - we'll render it specially as a NavLink
  const navItemsWithoutAI = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'Assistant');
  const isAIActive = location.pathname === '/app/assistant';

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

        {/* Navigation Bento */}
        <div className="bg-zinc-900 rounded-2xl p-3 space-y-[3px]">
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
                      'flex items-center gap-3.5 w-full px-3 py-3 rounded-xl text-left transition-colors text-[15px]',
                      isAIActive
                        ? 'bg-zinc-800 font-semibold text-white'
                        : 'text-white hover:bg-zinc-800/50'
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                      isAIActive ? "bg-zinc-700" : "bg-zinc-800"
                    )}>
                      <Sparkles className="w-[22px] h-[22px]" />
                    </div>
                    <span className="truncate">Assistant</span>
                  </NavLink>
                )}
              </div>
            );
          })}
        </div>

        {/* Post Button Bento */}
        <div className="mt-3 bg-zinc-900 rounded-2xl p-3">
          <Button 
            onClick={handlePostClick}
            className="w-full rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 font-semibold py-6 text-base gap-2"
          >
            <PenSquare className="w-5 h-5" />
            Post
          </Button>
        </div>
      </aside>

      <AuthPrompt 
        isOpen={showAuthPrompt} 
        onClose={() => setShowAuthPrompt(false)}
      />
    </>
  );
}
