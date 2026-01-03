import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PenSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { MobileHeader } from './navigation/MobileHeader';
import { DesktopSidebar } from './navigation/DesktopSidebar';
import { SidebarNavItem } from './navigation/SidebarNavItem';
import { PostModal } from '@/features/post';

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  const mobileNavContent = (
    <>
      {/* Navigation Items - scrollable */}
      <nav className="space-y-1">
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
              onNavigate={onToggle}
              variant="mobile"
            />
          );
        })}
      </nav>

      {/* Post Button - fixed at bottom with blur fade */}
      <div className="sticky bottom-0 mt-4">
        <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-zinc-900/95 to-transparent pointer-events-none" />
        <div className="pt-4 pb-4 bg-zinc-900/95 backdrop-blur-md">
          <Button 
            onClick={() => setIsPostModalOpen(true)}
            className="w-full rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 font-semibold py-6 text-base gap-2"
          >
            <PenSquare className="w-5 h-5" />
            Post
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header with Drawer */}
      <MobileHeader isOpen={isOpen} onToggle={onToggle}>
        {mobileNavContent}
      </MobileHeader>

      {/* Desktop Sidebar */}
      <DesktopSidebar onPostClick={() => setIsPostModalOpen(true)} />

      {/* Post Modal */}
      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
