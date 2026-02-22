import { useState, useEffect, useRef, useLayoutEffect, type ReactNode } from 'react';
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
import { toast } from 'sonner';

interface AppLayoutContentProps {
  children?: ReactNode;
}

// Session storage keys
const POST_OVERLAY_ORIGIN_KEY = 'post-overlay-origin';
const HOME_SCROLL_POSITION_KEY = 'home-scroll-position';

function AppLayoutContent({ children }: AppLayoutContentProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isPostModalOpen, closePostModal, pendingFiles, clearPendingFiles } = useGlobalDropZone();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Disable browser's automatic scroll restoration globally
  // This is CRITICAL - browsers default to 'auto' which fights our custom logic
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  // Show upgrade notice toast on first load
  useEffect(() => {
    const key = 'dehub_upgrade_toast_seen';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, 'true');
      toast('App upgrade almost complete', {
        description: 'Download DeHub on the Google Play Store today for full functionality.',
        duration: 8000,
        action: {
          label: 'Get it',
          onClick: () => window.open('https://play.google.com/store/apps/details?id=io.dehub.mobile&hl', '_blank'),
        },
      });
    }
  }, []);
  
  // Track if we're on a post overlay route
  const postMatch = useMatch('/app/post/:postId');
  const videoMatch = useMatch('/app/video/:tokenId');
  const isPostRoute = !!(postMatch || videoMatch);
  
  // Track if we came from home page (for overlay behavior)
  // CRITICAL: Initialize synchronously from sessionStorage to prevent HomePage unmounting on first render
  const [cameFromHome, setCameFromHome] = useState(() => {
    return sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
  });
  const prevPathRef = useRef<string | null>(null);
  const savedScrollRef = useRef<number>(0);
  
  // Helper to get scroll position (works for both window and documentElement)
  const getScrollPosition = () => {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };
  
  // Helper to set scroll position
  const setScrollPosition = (value: number) => {
    window.scrollTo(0, value);
    document.documentElement.scrollTop = value;
    document.body.scrollTop = value;
  };
  
  // Save home scroll position continuously when on home page
  // This ensures we capture the position BEFORE navigation happens
  useEffect(() => {
    const isHome = location.pathname === '/app';
    if (!isHome) return;
    
    const saveScroll = () => {
      const scrollPos = getScrollPosition();
      sessionStorage.setItem(HOME_SCROLL_POSITION_KEY, String(scrollPos));
      savedScrollRef.current = scrollPos;
    };
    
    // Save immediately
    saveScroll();
    
    // Save on every scroll - listen to both window and document
    window.addEventListener('scroll', saveScroll, { passive: true });
    document.addEventListener('scroll', saveScroll, { passive: true });
    
    // Also save on any click (captures position right before link clicks)
    const handleClick = () => saveScroll();
    document.addEventListener('click', handleClick, { capture: true, passive: true });
    
    return () => {
      window.removeEventListener('scroll', saveScroll);
      document.removeEventListener('scroll', saveScroll);
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [location.pathname]);
  
  // Detect navigation from home to post - set the origin flag
  useEffect(() => {
    const currentPath = location.pathname;
    const prevPath = prevPathRef.current;
    
    // Navigating TO a post route FROM home - mark origin
    if (isPostRoute && prevPath === '/app') {
      setCameFromHome(true);
      sessionStorage.setItem(POST_OVERLAY_ORIGIN_KEY, 'home');
    }
    
    // Update ref AFTER all checks
    prevPathRef.current = currentPath;
  }, [location.pathname, isPostRoute]);
  
  // Restore scroll position when returning to home from post overlay
  useLayoutEffect(() => {
    const isHomePage = location.pathname === '/app';
    const wasInPostOverlay = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
    
    if (isHomePage && wasInPostOverlay) {
      const savedScroll = sessionStorage.getItem(HOME_SCROLL_POSITION_KEY);
      const scrollValue = savedScroll ? parseInt(savedScroll, 10) : savedScrollRef.current;
      
      if (scrollValue > 0) {
        const attemptScroll = () => {
          setScrollPosition(scrollValue);
        };
        
        // Immediate attempt
        attemptScroll();
        
        // Use requestAnimationFrame for after-paint timing
        requestAnimationFrame(() => {
          attemptScroll();
          requestAnimationFrame(attemptScroll);
        });
        
        // Extended staggered attempts for lazy-loaded content
        const attempts = [16, 50, 100, 200, 400, 800];
        const timeouts = attempts.map(delay => 
          setTimeout(attemptScroll, delay)
        );
        
        // MutationObserver to catch content loading
        const observer = new MutationObserver(attemptScroll);
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Cleanup after restoration window
        const cleanupTimeout = setTimeout(() => {
          observer.disconnect();
          sessionStorage.removeItem(HOME_SCROLL_POSITION_KEY);
          sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
          setCameFromHome(false);
        }, 1000);
        
        // Cleanup timeouts if component unmounts
        return () => {
          timeouts.forEach(clearTimeout);
          clearTimeout(cleanupTimeout);
          observer.disconnect();
        };
      }
    }
  }, [location.pathname]);

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
          {/* CRITICAL: Use overflow-hidden to prevent hidden content from affecting scroll height */}
          {(isHomePage || showHomePagePersisted) && (
            <div className={showHomePagePersisted ? 'hidden' : ''}>
              <HomePage />
            </div>
          )}
          
          {/* Post overlay - renders on top when viewing a post from home */}
          {showHomePagePersisted && (
            <div className="w-full min-h-screen">
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
