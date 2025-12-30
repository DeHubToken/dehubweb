import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import dehubLogo from '@/assets/dehub-logo-white.png';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { PostModal } from './PostModal';

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  const navContent = (
    <>
      {/* Navigation Items */}
      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/app'
              ? location.pathname === '/app'
              : !item.external && location.pathname.startsWith(item.path);

          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.path}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onToggle}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors',
                  'text-zinc-400 hover:bg-zinc-700/50 hover:text-white'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </a>
            );
          }

          const isHome = item.path === '/app';
          const handleClick = (e: React.MouseEvent) => {
            if (isHome && location.pathname === '/app') {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('home-refresh'));
            }
            onToggle();
          };

          return (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={handleClick}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors',
                isActive
                  ? 'bg-zinc-700/50 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Post Button */}
      <div className="mt-4 pt-4 border-t border-zinc-700/50">
        <Button 
          onClick={() => setIsPostModalOpen(true)}
          className="w-full rounded-xl bg-white text-black hover:bg-zinc-200 font-semibold py-6 text-base"
        >
          Post
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header with Drawer */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black px-4 py-2 flex items-center justify-between">
        <NavLink to="/app" className="block">
          <img src={dehubLogo} alt="dehub" className="h-6 w-auto cursor-pointer" />
        </NavLink>
        
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
              {navContent}
            </div>
          </DrawerContent>
        </Drawer>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-64 p-4 flex-col">
        {/* Logo */}
        <NavLink to="/app" className="mb-6 block">
          <img src={dehubLogo} alt="dehub" className="h-10 w-auto" />
        </NavLink>

        {/* Navigation Bento */}
        <div className="bg-zinc-900 rounded-2xl p-3 overflow-y-auto space-y-[3px]">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.path === '/app'
                ? location.pathname === '/app'
                : !item.external && location.pathname.startsWith(item.path);

            if (item.external) {
              return (
                <a
                  key={item.label}
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors',
                    'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              );
            }

            const isHome = item.path === '/app';
            const handleClick = (e: React.MouseEvent) => {
              if (isHome && location.pathname === '/app') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('home-refresh'));
              }
            };

            return (
              <NavLink
                key={item.label}
                to={item.path}
                onClick={handleClick}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors',
                  isActive
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Post Button Bento */}
        <div className="mt-4 bg-zinc-900 rounded-2xl p-3">
          <Button 
            onClick={() => setIsPostModalOpen(true)}
            className="w-full rounded-xl bg-white text-black hover:bg-zinc-200 font-semibold py-6 text-base"
          >
            Post
          </Button>
        </div>
      </aside>

      {/* Post Modal */}
      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
