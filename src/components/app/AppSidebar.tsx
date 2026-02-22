import { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { PenSquare, LogIn, LogOut } from 'lucide-react';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { NAV_ITEMS } from '@/constants/app.constants';
import { MobileHeader } from './navigation/MobileHeader';
import { DesktopSidebar } from './navigation/DesktopSidebar';
import { SidebarNavItem } from './navigation/SidebarNavItem';
import { PostModal } from '@/features/post';
import { useAuth } from '@/contexts/AuthContext';
import { ChainSelector, type ChainId } from './ChainSelector';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const { isAuthenticated, disconnect } = useAuth();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<ChainId>(() => {
    const stored = localStorage.getItem('preferred-chain-id');
    return stored ? (Number(stored) as ChainId) : (BASE_CHAIN_ID as ChainId);
  });
  const handleChainChange = useCallback((id: ChainId) => {
    setSelectedChainId(id);
    localStorage.setItem('preferred-chain-id', String(id));
  }, []);

  const mobileNavContent = (
    <>
      {/* Log in Button - shown at top when not authenticated */}
      {!isAuthenticated && (
        <div className="mb-4 pb-4">
          <LiquidGlassBubble shimmer noBorder className="w-full cursor-pointer" onClick={() => setIsPostModalOpen(true)}>
            <div className="flex items-center justify-center gap-2 font-semibold text-base text-white py-1.5">
              <LogIn className="w-5 h-5" />
              Log in
            </div>
          </LiquidGlassBubble>
        </div>
      )}

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

      {/* Post Button - only shown when authenticated */}
      {isAuthenticated && (
        <div className="mt-4 pt-4 space-y-3">
          <LiquidGlassBubble shimmer className="w-full cursor-pointer" onClick={() => setIsPostModalOpen(true)}>
            <div className="flex items-center justify-center gap-2 font-semibold text-base text-white py-1.5">
              <PenSquare className="w-5 h-5" />
              Post
            </div>
          </LiquidGlassBubble>
          <div className="flex items-center justify-center gap-3">
            <ChainSelector
              selectedChainId={selectedChainId}
              onChainChange={handleChainChange}
              variant="icon"
            />
            <button
              onClick={() => { onToggle(); disconnect(); }}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors py-2"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      )}
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
