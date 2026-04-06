import { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, Plus, User, Search, Trophy, Bookmark, Settings, LayoutDashboard, Sparkles, Bell, Wallet, BookOpen, FileText, Lightbulb, Briefcase, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';
import { AuthPrompt } from './AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useStage } from '@/contexts/StageContext';



// Left side: Home, Messages
const LEFT_NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: MessageSquare, label: 'Messages', path: '/app/messages' },
];

// Right side: AI link, Profile
const RIGHT_NAV_ITEMS = [
  { icon: Sparkles, label: 'AI', path: '/app/assistant' },
];

const SCROLL_NAV_ITEMS = [
  { icon: User, label: 'Profile', path: '/app/profile', requiresAuth: true },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: LayoutDashboard, label: 'Command', path: '/app/command-centre' },
  { icon: Wallet, label: 'Wallet', path: '/app/wallet' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
  { icon: BookOpen, label: 'Docs', path: 'https://docs.dhb.gg', external: true },
  { icon: FileText, label: 'Blog', path: '/docs/blog' },
  { icon: Lightbulb, label: 'Features', path: '/features' },
  { icon: Briefcase, label: 'Careers', path: '/app/jobs' },
  { icon: BookOpen, label: 'Glossary', path: '/app/glossary' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // First-visit scroll hint: nudge right then back to show more options
  useEffect(() => {
    const HINT_KEY = 'dehub_nav_scroll_hint_seen';
    if (localStorage.getItem(HINT_KEY)) return;
    
    const timer = setTimeout(() => {
      const el = scrollRef.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      
      // Smooth scroll right
      el.scrollTo({ left: 120, behavior: 'smooth' });
      
      // Then scroll back after a pause
      setTimeout(() => {
        el.scrollTo({ left: 0, behavior: 'smooth' });
        localStorage.setItem(HINT_KEY, 'true');
      }, 600);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);


  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (path === '/app' && location.pathname === '/app') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('home-refresh'));
      navigate('/app');
    }
  };

  const handleProtectedNavClick = (e: React.MouseEvent, path: string, requiresAuth?: boolean) => {
    if (requiresAuth && !isAuthenticated) {
      e.preventDefault();
      setShowAuthPrompt(true);
      return;
    }
    handleNavClick(e, path);
  };

  const handlePostClick = () => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }
    setIsPostModalOpen(true);
  };

  // Track scroll progress
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const maxScroll = container.scrollWidth - container.clientWidth;
      const progress = maxScroll > 0 ? Math.min(container.scrollLeft / maxScroll, 1) : 0;
      setScrollProgress(progress);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate opacity: fades quickly on scroll (reaches 0 at ~10% scroll)
  const buttonOpacity = Math.max(0, 1 - scrollProgress * 10);
  

  return (
    <>
      {/* Bottom blur gradient overlay */}
      <div 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none h-[60px]"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.05) 15%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.85) 90%, rgba(0,0,0,0.95) 100%)',
        }}
      />
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav
          className="relative bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-[72%] md:max-w-md shadow-xl transition-all duration-1000"
        >
          {/* Nav items container */}
          <div 
            ref={scrollRef}
            className="flex items-center h-12 md:h-14 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollSnapType: 'x proximity' }}
          >
            {/* Left side items - Home + Messages */}
            <div className="flex items-center justify-start flex-shrink-0 pl-1" style={{ width: 'calc(50% - 24px)' }}>
              {LEFT_NAV_ITEMS.map((item, index) => {
                const isActive = item.path === '/app' 
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={(e) => handleNavClick(e, item.path)}
                    className={cn(
                      'flex items-center justify-center h-12 md:h-14 flex-1 transition-all duration-200 text-white',
                      index === 0 && 'rounded-l-2xl'
                    )}
                  >
                      <item.icon 
                        className={cn(
                          'w-5 h-5 md:w-6 md:h-6 transition-all duration-200',
                          isActive 
                            ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                            : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]',
                          item.label === 'Messages' && 'lg:ml-0',
                          item.label === 'Home' ? '-ml-[6.5px] lg:ml-0' : '-ml-[5.5px] lg:ml-0'
                        )} 
                      />
                  </NavLink>
                );
              })}
            </div>

            {/* Center Create Button - liquid glass bubble */}
            <button
              onClick={handlePostClick}
              className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center"
            >
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center relative transition-all duration-300 active:scale-95">
                  <div 
                    className="absolute inset-0 rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.3)] transition-opacity duration-300"
                    style={{ opacity: buttonOpacity }}
                  />
                  <Plus className="w-5 h-5 md:w-6 md:h-6 text-white relative z-10" />
                </div>
            </button>

            {/* Right side items - AI + Profile */}
            <div className="flex items-center justify-end flex-shrink-0 pr-1" style={{ width: 'calc(50% - 24px)' }}>
              {RIGHT_NAV_ITEMS.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="flex items-center justify-center h-12 md:h-14 flex-1 transition-all duration-200 text-white"
                  >
                      <item.icon 
                        className={cn(
                          'w-5 h-5 md:w-6 md:h-6 transition-all duration-200',
                          isActive 
                            ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                            : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]',
                          'ml-[6px] lg:ml-0'
                        )} 
                      />
                  </NavLink>
                );
              })}
              
              {/* Search Link */}
              <NavLink
                to="/app/explore"
                className="flex items-center justify-center h-12 md:h-14 flex-1 transition-all duration-200 text-white rounded-r-2xl"
              >
                  <Search 
                    className={cn(
                      'w-5 h-5 md:w-6 md:h-6 transition-all duration-200 ml-[4px] lg:ml-0',
                      location.pathname.startsWith('/app/explore')
                        ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                        : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]'
                    )} 
                  />
                
              </NavLink>
            </div>

            {/* Additional items - accessible via scroll */}
            {SCROLL_NAV_ITEMS.map((item) => {
              const isActive = !item.external && location.pathname.startsWith(item.path);
              
              if (item.external) {
                return (
                  <a
                    key={item.label}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-12 md:h-14 flex-shrink-0 transition-all duration-200 text-white"
                    style={{ width: 'calc((50% - 24px) / 2)' }}
                  >
                    <item.icon className="w-5 h-5 md:w-6 md:h-6 transition-all duration-200 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                  </a>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={(e) => handleProtectedNavClick(e, item.path, (item as any).requiresAuth)}
                  className="flex items-center justify-center h-12 md:h-14 flex-shrink-0 transition-all duration-200 text-white"
                  style={{ width: 'calc((50% - 24px) / 2)' }}
                >
                  <item.icon 
                    className={cn(
                      'w-5 h-5 md:w-6 md:h-6 transition-all duration-200',
                      isActive 
                        ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                        : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]'
                    )} 
                  />
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>

      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
      <AuthPrompt isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
    </>
  );
}
