import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { GlobalDropZoneProvider, useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { PostModal } from '@/features/post/PostModal';

function AppLayoutContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isPostModalOpen, closePostModal, pendingFiles, clearPendingFiles } = useGlobalDropZone();

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-black text-white overflow-x-clip" style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'none' }}>
      <div className="flex max-w-7xl mx-auto w-full relative min-h-screen">
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="flex-1 min-h-screen pt-14 pb-16 lg:pt-0 lg:pb-0 min-w-0 w-full bg-black">
          <Outlet />
        </main>
        
        <RightSidebar />
      </div>
      
      <MobileBottomNav />
      
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

export function AppLayout() {
  return (
    <GlobalDropZoneProvider>
      <AppLayoutContent />
    </GlobalDropZoneProvider>
  );
}
