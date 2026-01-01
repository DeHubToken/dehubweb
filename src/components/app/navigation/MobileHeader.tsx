import { useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import dehubLogo from '@/assets/dehub-logo-white.png';

interface MobileHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function MobileHeader({ isOpen, onToggle, children }: MobileHeaderProps) {
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
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 py-2 flex items-center justify-between">
      <button onClick={handleLogoClick} className="block cursor-pointer">
        <img src={dehubLogo} alt="dehub" className="h-6 w-auto" />
      </button>
      
      <div className="flex items-center gap-2">
        {/* Coin Balance */}
        <CoinBalanceMenu balance={coinBalance} variant="mobile" />
        
        {/* Menu Button */}
        <Drawer open={isOpen} onOpenChange={onToggle}>
          <DrawerTrigger asChild>
            <button
              className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6 text-white" />
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
