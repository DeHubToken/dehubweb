import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import dehubLogo from '@/assets/dehub-logo-white.png';

interface MobileHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function MobileHeader({ isOpen, onToggle, children }: MobileHeaderProps) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 py-2 flex items-center justify-between">
      <Link to="/app" className="block cursor-pointer">
        <img src={dehubLogo} alt="dehub" className="h-6 w-auto" />
      </Link>
      
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
    </header>
  );
}
