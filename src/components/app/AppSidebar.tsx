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

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();

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
                  'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </a>
            );
          }

          return (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={onToggle}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors',
                isActive
                  ? 'bg-accent text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Post Button */}
      <div className="mt-4 pt-4 border-t border-border">
        <Button className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-6 text-base">
          Post
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header with Drawer */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background px-4 py-2 flex items-center justify-between">
        <img src={dehubLogo} alt="dehub" className="h-6 w-auto dark:block hidden" />
        <img src={dehubLogo} alt="dehub" className="h-6 w-auto dark:hidden block invert" />
        
        <Drawer open={isOpen} onOpenChange={onToggle}>
          <DrawerTrigger asChild>
            <button
              className="p-2 rounded-full hover:bg-accent transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6 text-foreground" />
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
        <div className="mb-6">
          <img src={dehubLogo} alt="dehub" className="h-10 w-auto dark:block hidden" />
          <img src={dehubLogo} alt="dehub" className="h-10 w-auto dark:hidden block invert" />
        </div>

        {/* Navigation Bento */}
        <div className="bg-card rounded-2xl p-3 overflow-y-auto">
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
                    'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              );
            }

            return (
              <NavLink
                key={item.label}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-colors',
                  isActive
                    ? 'bg-accent text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Post Button Bento */}
        <div className="mt-4 bg-card rounded-2xl p-3">
          <Button className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-6 text-base">
            Post
          </Button>
        </div>
      </aside>
    </>
  );
}
