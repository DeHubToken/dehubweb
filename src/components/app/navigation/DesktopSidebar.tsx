import { useLocation, useNavigate } from 'react-router-dom';
import { PenSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SidebarNavItem } from './SidebarNavItem';
import dehubLogo from '@/assets/dehub-logo-white.png';
import dehubCoin from '@/assets/dehub-coin.png';

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

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-64 p-4 flex-col">
      {/* Logo & Coin Balance */}
      <div className="mb-6 flex items-center justify-between">
        <button onClick={handleLogoClick} className="block cursor-pointer">
          <img src={dehubLogo} alt="dehub" className="h-10 w-auto" />
        </button>
        <div className="flex items-center gap-1.5 bg-zinc-900 rounded-full px-2.5 py-1.5">
          <img src={dehubCoin} alt="coins" className="h-5 w-5" />
          <span className="text-sm font-semibold text-white">{coinBalance.toLocaleString()}</span>
        </div>
      </div>

      {/* Navigation Bento */}
      <div className="bg-zinc-900 rounded-2xl p-3 overflow-y-auto space-y-[3px]">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/app'
              ? location.pathname === '/app'
              : !item.external && location.pathname.startsWith(item.path);

          return (
            <SidebarNavItem
              key={item.label}
              item={item}
              isActive={isActive}
              isHome={item.path === '/app'}
              currentPath={location.pathname}
              variant="desktop"
            />
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
  );
}
