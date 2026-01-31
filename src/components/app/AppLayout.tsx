import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { GlobalDropZoneProvider, useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { RadioPlayerProvider } from '@/hooks';
import { CoinPlacementProvider } from '@/hooks/use-coin-placement';
import { PostModal } from '@/features/post/PostModal';
import { DevelopmentNoticeModal } from './modals';
import { RadioMiniPlayer } from '@/components/app/radio';
interface AppLayoutContentProps {
  children?: ReactNode;
}

function AppLayoutContent({ children }: AppLayoutContentProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isPostModalOpen, closePostModal, pendingFiles, clearPendingFiles } = useGlobalDropZone();

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-clip" style={{ touchAction: 'manipulation', overscrollBehavior: 'none' }}>
      <div className="flex max-w-7xl mx-auto w-full relative min-h-screen">
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="flex-1 min-h-screen pt-11 pb-16 lg:pt-0 lg:pb-0 min-w-0 w-full bg-black">
          {children || <Outlet />}
        </main>
        
        <RightSidebar />
      </div>
      
      <MobileBottomNav />
      
      {/* Development Notice Modal */}
      <DevelopmentNoticeModal />
      
      {/* Radio Mini Player */}
      <RadioMiniPlayer />
      
      {/* Global Post Modal for drag & drop */}
      <PostModal 
        isOpen={isPostModalOpen} 
        onClose={closePostModal}
        initialFiles={pendingFiles}
        onFilesProcessed={clearPendingFiles}
      />
    </div>
  );
}

interface AppLayoutProps {
  children?: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <RadioPlayerProvider>
      <CoinPlacementProvider>
        <GlobalDropZoneProvider>
          <AppLayoutContent>{children}</AppLayoutContent>
        </GlobalDropZoneProvider>
      </CoinPlacementProvider>
    </RadioPlayerProvider>
  );
}
