import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex max-w-7xl mx-auto w-full">
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="flex-1 pt-14 pb-20 lg:pt-0 lg:pb-0 min-w-0 w-full overflow-x-hidden">
          <Outlet />
        </main>
        
        <RightSidebar />
      </div>
      
      <MobileBottomNav />
    </div>
  );
}
