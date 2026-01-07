import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PenSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { GeneralAIChat } from '../chat/GeneralAIChat';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { cn } from '@/lib/utils';

interface DesktopSidebarProps {
  onPostClick: () => void;
}

export function DesktopSidebar({ onPostClick }: DesktopSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);

  // TODO: Replace with actual balance from auth/wallet state
  const coinBalance = 0;

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname.startsWith('/app')) {
      window.dispatchEvent(new CustomEvent('home-refresh'));
    }
    navigate('/app');
  };

  // Filter out AI item - we'll render it specially
  const navItemsWithoutAI = NAV_ITEMS.filter((item) => item.path !== '/app' && item.label !== 'AI');

  return (
    <>
      <aside className="hidden lg:flex sticky top-0 h-screen w-64 p-4 flex-col">
        {/* Logo & Coin Balance */}
        <div className="mb-6 flex items-center justify-between">
          <button onClick={handleLogoClick} className="block cursor-pointer">
            <img src={dehubLogo} alt="dehub" className="h-10 w-auto" />
          </button>
          <CoinBalanceMenu balance={coinBalance} variant="desktop" />
        </div>

        {/* Navigation Bento */}
        <div className="bg-zinc-900 rounded-2xl p-3 space-y-[3px]">
          {navItemsWithoutAI.map((item, index) => {
            const isActive = !item.external && location.pathname.startsWith(item.path);
            
            // Insert AI button after Messages (index 3 = Messages in filtered array)
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
                  <button
                    onClick={() => setIsAIChatOpen(true)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors',
                      'text-white hover:bg-zinc-800/50'
                    )}
                  >
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="truncate">AI</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Post Button Bento */}
        <div className="mt-4 bg-zinc-900 rounded-2xl p-3">
          <Button 
            onClick={onPostClick}
            className="w-full rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 font-semibold py-6 text-base gap-2"
          >
            <PenSquare className="w-5 h-5" />
            Post
          </Button>
        </div>
      </aside>

      <GeneralAIChat isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
    </>
  );
}
