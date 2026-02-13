import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PenSquare, LogIn } from 'lucide-react';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { NAV_ITEMS } from '@/constants/app.constants';
import { MobileHeader } from './navigation/MobileHeader';
import { DesktopSidebar } from './navigation/DesktopSidebar';
import { SidebarNavItem } from './navigation/SidebarNavItem';
import { PostModal } from '@/features/post';
import { useAuth } from '@/contexts/AuthContext';

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  const mobileNavContent = (
    <>
      {/* Navigation Items */}
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

      {/* Post Button */}
      <div className="mt-4 pt-4 border-t border-zinc-700/50">
        <LiquidGlassBubble shimmer className="w-full cursor-pointer" onClick={() => setIsPostModalOpen(true)}>
          <div className="flex items-center justify-center gap-2 font-semibold text-base text-white py-1.5">
            {isAuthenticated ? (
              <>
                <PenSquare className="w-5 h-5" />
                Post
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Log in
              </>
            )}
          </div>
        </LiquidGlassBubble>
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
