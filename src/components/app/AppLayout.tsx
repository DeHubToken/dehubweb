import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex max-w-7xl mx-auto">
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="flex-1 min-h-screen lg:border-r border-zinc-800 pt-14 lg:pt-0">
          <Outlet />
        </main>
        
        <RightSidebar />
      </div>
    </div>
  );
}
