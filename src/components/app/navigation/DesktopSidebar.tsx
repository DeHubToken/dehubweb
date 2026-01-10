import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { PenSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { cn } from '@/lib/utils';

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // TODO: Replace with actual balance from auth/wallet state
  const coinBalance = 0;

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname.startsWith('/app')) {
      window.dispatchEvent(new CustomEvent('home-refresh'));
    }
    navigate('/app');
  };

  // Filter out Assistant item - we'll render it specially as a NavLink
  const navItemsWithoutAI = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'Assistant');
  const isAIActive = location.pathname === '/app/assistant';

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-[261px] p-5 flex-col">
      {/* Logo & Coin Balance */}
      <div className="mb-5 flex items-center justify-between">
        <button onClick={handleLogoClick} className="block cursor-pointer">
          <img src={dehubLogo} alt="dehub" className="h-[44px] w-auto" />
        </button>
        <CoinBalanceMenu balance={coinBalance} variant="desktop" />
      </div>

      {/* Navigation Bento */}
      <div className="bg-zinc-900 rounded-xl p-2.5 space-y-[2px]">
        {navItemsWithoutAI.map((item) => {
          const isActive = !item.external && location.pathname.startsWith(item.path);
          
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
              />
              {isAfterMessages && (
                <NavLink
                  to="/app/assistant"
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors text-sm',
                    isAIActive
                      ? 'bg-zinc-800 font-semibold text-white'
                      : 'text-white hover:bg-zinc-800/50'
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    isAIActive ? "bg-zinc-700" : "bg-zinc-800"
                  )}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="truncate">Assistant</span>
                </NavLink>
              )}
            </div>
          );
        })}
      </div>

      {/* Spacer to push Post button to bottom */}
      <div className="flex-1" />

      {/* Post Button Bento */}
      <div className="mt-3 bg-zinc-900 rounded-xl p-2.5">
        <Button 
          onClick={onPostClick}
          className="w-full rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 font-semibold py-5 text-sm gap-2"
        >
          <PenSquare className="w-4 h-4" />
          Post
        </Button>
      </div>
    </aside>
  );
}
