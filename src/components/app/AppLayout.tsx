import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';

interface AppLayoutProps {
  showRightSidebarSearch?: boolean;
}

export function AppLayout({ showRightSidebarSearch = true }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex max-w-7xl mx-auto">
        <AppSidebar />
        <main className="flex-1 border-r border-zinc-800 min-h-screen">
          <Outlet />
        </main>
        <RightSidebar showSearch={showRightSidebarSearch} />
      </div>
    </div>
  );
}
