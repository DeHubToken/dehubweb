import { useState, useEffect, useRef, useLayoutEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { GlobalDropZoneProvider, useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { RadioPlayerProvider } from '@/hooks';
import { CoinPlacementProvider } from '@/hooks/use-coin-placement';
import { SidebarCollapseProvider, useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { PostModal } from '@/features/post/PostModal';
import { DevelopmentNoticeModal } from './modals';
import { RadioMiniPlayer } from '@/components/app/radio';
import { MinimizedAIChats } from '@/components/app/MinimizedAIChats';
import { PersistentPageCache, isCachedPageRoute } from './PersistentPageCache';
import { GlobalFeedNav } from './GlobalFeedNav';
import { cn } from '@/lib/utils';
import SinglePostPage from '@/pages/app/SinglePostPage';

interface AppLayoutContentProps {
  children?: ReactNode;
}

// Session storage keys
const POST_OVERLAY_ORIGIN_KEY = 'post-overlay-origin';
const HOME_SCROLL_POSITION_KEY = 'home-scroll-position';

function AppLayoutContent({ children }: AppLayoutContentProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isPostModalOpen, closePostModal, pendingFiles, clearPendingFiles } = useGlobalDropZone();
  const { isCollapsed } = useSidebarCollapse();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Disable browser's automatic scroll restoration globally
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);
  
  // Track if we're on a post overlay route
  const postMatch = useMatch('/app/post/:postId');
  const videoMatch = useMatch('/app/video/:tokenId');
  const isPostRoute = !!(postMatch || videoMatch);
  
  // Track if we came from home page (for overlay behavior)
  const [cameFromHome, setCameFromHome] = useState(() => {
    return sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
  });
  const prevPathRef = useRef<string | null>(null);
  const savedScrollRef = useRef<number>(0);
  
  const getScrollPosition = () => {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };
  
  const setScrollPosition = (value: number) => {
    window.scrollTo(0, value);
    document.documentElement.scrollTop = value;
    document.body.scrollTop = value;
  };
  
  // Save home scroll position continuously when on home page
  useEffect(() => {
    const isHome = location.pathname === '/app';
    if (!isHome) return;
    
    const saveScroll = () => {
      const scrollPos = getScrollPosition();
      sessionStorage.setItem(HOME_SCROLL_POSITION_KEY, String(scrollPos));
      savedScrollRef.current = scrollPos;
    };
    
    saveScroll();
    
    window.addEventListener('scroll', saveScroll, { passive: true });
    document.addEventListener('scroll', saveScroll, { passive: true });
    
    const handleClick = () => saveScroll();
    document.addEventListener('click', handleClick, { capture: true, passive: true });
    
    return () => {
      window.removeEventListener('scroll', saveScroll);
      document.removeEventListener('scroll', saveScroll);
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [location.pathname]);
  
  // Detect navigation from home to post
  useEffect(() => {
    const currentPath = location.pathname;
    const prevPath = prevPathRef.current;
    
    if (isPostRoute && prevPath === '/app') {
      setCameFromHome(true);
      sessionStorage.setItem(POST_OVERLAY_ORIGIN_KEY, 'home');
    }
    
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
        
        attemptScroll();
        
        requestAnimationFrame(() => {
          attemptScroll();
          requestAnimationFrame(attemptScroll);
        });
        
        const attempts = [16, 50, 100, 200, 400, 800];
        const timeouts = attempts.map(delay => 
          setTimeout(attemptScroll, delay)
        );
        
        const observer = new MutationObserver(attemptScroll);
        observer.observe(document.body, { childList: true, subtree: true });
        
        const cleanupTimeout = setTimeout(() => {
          observer.disconnect();
          sessionStorage.removeItem(HOME_SCROLL_POSITION_KEY);
          sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
          setCameFromHome(false);
        }, 1000);
        
        return () => {
          timeouts.forEach(clearTimeout);
          clearTimeout(cleanupTimeout);
          observer.disconnect();
        };
      }
    }
  }, [location.pathname]);

  // Scroll to top when navigating between cached pages (not home overlay)
  const prevCachedPathRef = useRef(location.pathname);
  useEffect(() => {
    const prev = prevCachedPathRef.current;
    const curr = location.pathname;
    prevCachedPathRef.current = curr;
    
    if (prev !== curr && isCachedPageRoute(curr) && curr !== '/app') {
      // Don't scroll to top when returning to home (handled by scroll restoration)
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  
  const showHomePagePersisted = isPostRoute && cameFromHome;
  const isHomePage = location.pathname === '/app';
  const isCached = isCachedPageRoute(location.pathname);
  // Dynamic routes: post overlay, single post, post info, or username profiles
  const isDynamicRoute = !isCached && !showHomePagePersisted;

  return (
    <div className="min-h-screen bg-black text-white overflow-x-clip" style={{ touchAction: 'manipulation', overscrollBehavior: 'none' }}>
      <div
        className="flex w-full relative min-h-screen mx-auto transition-[max-width] duration-500 ease-in-out motion-reduce:transition-none"
        style={{ maxWidth: isCollapsed ? '100%' : '80rem', willChange: 'max-width', transform: 'translateZ(0)' }}
      >
        <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="flex-1 min-h-screen pt-11 pb-16 lg:pt-0 lg:pb-0 min-w-0 w-full bg-black">
          {/* Global feed nav — keep mounted and animate in/out to avoid rigid multi-step jumps */}
          <div
            className={cn(
              'hidden lg:block overflow-hidden transition-[height,opacity] duration-500 ease-in-out motion-reduce:transition-none',
              isCollapsed ? 'h-12 opacity-100' : 'h-0 opacity-0 pointer-events-none'
            )}
          >
            <GlobalFeedNav />
          </div>
          {/* Persistent page cache — all visited pages stay mounted */}
          <PersistentPageCache />
          
          {/* Post overlay — renders on top when viewing a post from home */}
          {showHomePagePersisted && (
            <div className="w-full min-h-screen">
              <SinglePostPage />
            </div>
          )}
          
          {/* Dynamic routes (post pages, username profiles, etc.) use Outlet */}
          {isDynamicRoute && (
            children || <Outlet />
          )}
        </main>
        
        <RightSidebar />
      </div>
      
      <MobileBottomNav />
      
      <RadioMiniPlayer />
      <MinimizedAIChats />
      
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
    <SidebarCollapseProvider>
      <RadioPlayerProvider>
        <CoinPlacementProvider>
          <GlobalDropZoneProvider>
            <AppLayoutContent>{children}</AppLayoutContent>
          </GlobalDropZoneProvider>
        </CoinPlacementProvider>
      </RadioPlayerProvider>
    </SidebarCollapseProvider>
  );
}
