import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import dehubLogo from '@/assets/dehub-logo-white.png';

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <img src={dehubLogo} alt="dehub" className="h-8 w-auto" />
        <button
          onClick={onToggle}
          className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-white" />}
        </button>
      </header>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-40 h-screen w-72 lg:w-64 p-4 flex flex-col',
          'bg-black lg:bg-transparent',
          'transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo - Desktop only */}
        <div className="hidden lg:block mb-6">
          <img src={dehubLogo} alt="dehub" className="h-10 w-auto" />
        </div>

        {/* Mobile spacer for header */}
        <div className="h-14 lg:hidden" />

        {/* Navigation Bento */}
        <nav className="bg-zinc-900 rounded-2xl p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.path === '/app'
                ? location.pathname === '/app'
                : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.label}
                to={item.path}
                onClick={() => window.innerWidth < 1024 && onToggle()}
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
        </nav>

        {/* Post Button Bento */}
        <div className="mt-4 bg-zinc-900 rounded-2xl p-3">
          <Button className="w-full rounded-xl bg-white text-black hover:bg-zinc-200 font-semibold py-6 text-base">
            Post
          </Button>
        </div>
      </aside>
    </>
  );
}
