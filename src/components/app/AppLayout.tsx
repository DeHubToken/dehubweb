import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { GlobalDropZoneProvider, useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { RadioPlayerProvider } from '@/hooks';
import { CoinPlacementProvider } from '@/hooks/use-coin-placement';
import { PostModal } from '@/features/post/PostModal';
import { DevelopmentNoticeModal } from './modals';
import { RadioMiniPlayer } from '@/components/app/radio';
import { MinimizedAIChats } from '@/components/app/MinimizedAIChats';
import HomePage from '@/pages/app/HomePage';
import SinglePostPage from '@/pages/app/SinglePostPage';

interface AppLayoutContentProps {
  children?: ReactNode;
}

// Session storage key for tracking navigation origin
const POST_OVERLAY_ORIGIN_KEY = 'post-overlay-origin';

function AppLayoutContent({ children }: AppLayoutContentProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isPostModalOpen, closePostModal, pendingFiles, clearPendingFiles } = useGlobalDropZone();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Track if we're on a post overlay route
  const postMatch = useMatch('/app/post/:postId');
  const videoMatch = useMatch('/app/video/:tokenId');
  const isPostRoute = !!(postMatch || videoMatch);
  
  // Track if we came from home page (for overlay behavior)
  const [cameFromHome, setCameFromHome] = useState(false);
  const prevPathRef = useRef<string | null>(null);
  
  // Detect navigation from home to post
  useEffect(() => {
    const currentPath = location.pathname;
    const prevPath = prevPathRef.current;
    
    // Navigating TO a post route
    if (isPostRoute && prevPath === '/app') {
      setCameFromHome(true);
      sessionStorage.setItem(POST_OVERLAY_ORIGIN_KEY, 'home');
    }
    
    // Navigating AWAY from post route (back to home or elsewhere)
    if (!isPostRoute && prevPath?.startsWith('/app/post/') || prevPath?.startsWith('/app/video/')) {
      setCameFromHome(false);
      sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
    }
    
    // Check sessionStorage on mount (for page refreshes mid-navigation)
    if (isPostRoute && !cameFromHome) {
      const storedOrigin = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY);
      if (storedOrigin === 'home') {
        setCameFromHome(true);
      }
    }
    
    prevPathRef.current = currentPath;
  }, [location.pathname, isPostRoute, cameFromHome]);
  
  // Clear overlay state when navigating away from post
  useEffect(() => {
    if (!isPostRoute) {
      sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
    }
  }, [isPostRoute]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  
  // Determine if we should show the overlay pattern
  const showHomePagePersisted = isPostRoute && cameFromHome;
  const isHomePage = location.pathname === '/app';

  return (
    <div className="min-h-screen bg-black text-white overflow-x-clip" style={{ touchAction: 'manipulation', overscrollBehavior: 'none' }}>
      <div className="flex max-w-7xl mx-auto w-full relative min-h-screen">
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="flex-1 min-h-screen pt-11 pb-16 lg:pt-0 lg:pb-0 min-w-0 w-full bg-black">
          {/* Keep HomePage mounted when viewing post from home (overlay pattern) */}
          {(isHomePage || showHomePagePersisted) && (
            <div style={{ 
              visibility: showHomePagePersisted ? 'hidden' : 'visible',
              position: showHomePagePersisted ? 'absolute' : 'static',
              width: '100%',
              height: showHomePagePersisted ? 0 : 'auto',
              overflow: showHomePagePersisted ? 'hidden' : 'visible',
            }}>
              <HomePage />
            </div>
          )}
          
          {/* Post overlay - renders on top when viewing a post from home */}
          {showHomePagePersisted && (
            <div className="w-full">
              <SinglePostPage />
            </div>
          )}
          
          {/* Other routes use Outlet normally (not home, not post overlay) */}
          {!isHomePage && !showHomePagePersisted && (
            children || <Outlet />
          )}
        </main>
        
        <RightSidebar />
      </div>
      
      <MobileBottomNav />
      
      {/* Development Notice Modal */}
      <DevelopmentNoticeModal />
      
      {/* Radio Mini Player */}
      <RadioMiniPlayer />
      
      {/* Minimized AI Chats */}
      <MinimizedAIChats />
      
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
