import { useState, useRef, useEffect, useMemo } from 'react';
import { useScrollDirection } from '@/hooks/use-scroll-direction';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, Plus, User, Search, Trophy, Bookmark, Settings, LayoutDashboard, Sparkles, Bell, Wallet, BookOpen, FileText, Lightbulb, Briefcase, Mic, Users, CalendarDays, Vault, ShieldCheck, Scroll, Map, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';
import { AuthPrompt } from './AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useStage } from '@/contexts/StageContext';
import { useTotalUnreadCount } from '@/hooks/use-messages';



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
  { icon: Wand2, label: 'Prompt', path: '/prompt' },
  { icon: CalendarDays, label: 'Events', path: '/app/events' },
  { icon: Mic, label: 'Stages', path: '#stages', action: 'open-stages' },
  { icon: LayoutDashboard, label: 'Command', path: '/app/command-centre' },
  { icon: Wallet, label: 'Wallet', path: '/app/wallet' },
  { icon: Vault, label: 'Staking', path: '/app/stake' },
  { icon: ShieldCheck, label: 'Governance', path: '/governance' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
  { icon: Lightbulb, label: 'Features', path: '/features' },
  { icon: Map, label: 'Guide', path: '/guide' },
  { icon: BookOpen, label: 'Docs', path: '/docs' },
  { icon: FileText, label: 'Blog', path: '/docs/blog' },
  { icon: Briefcase, label: 'Careers', path: '/app/jobs' },
  { icon: Scroll, label: 'Glossary', path: '/app/glossary' },
  { icon: Users, label: 'Communities', path: '/app/communities' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openModal: openStagesModal } = useStage();
  const dmUnread = useTotalUnreadCount();
  const navVisible = useScrollDirection();
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
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none h-[60px] transition-transform duration-300 ease-in-out"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.05) 15%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.85) 90%, rgba(0,0,0,0.95) 100%)',
          transform: navVisible ? 'translateY(0)' : 'translateY(110%)',
          willChange: 'transform',
        }}
      />
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2 transition-transform duration-300 ease-in-out"
        style={{ transform: navVisible ? 'translateY(0)' : 'translateY(110%)', willChange: 'transform' }}
      >
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
                      'relative flex items-center justify-center h-12 md:h-14 flex-1 transition-all duration-200 text-white',
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
                      {item.label === 'Messages' && dmUnread > 0 && (
                        <span className="absolute top-1.5 right-1 min-w-[16px] h-[16px] px-[3px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                          {dmUnread > 99 ? '99+' : dmUnread}
                        </span>
                      )}
                  </NavLink>
                );
              })}
            </div>

            {/* Center Create Button - liquid glass bubble */}
            <button
              onClick={handlePostClick}
              aria-label="Create post"
              className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-white"
            >
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center relative transition-all duration-300 active:scale-95">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl border border-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_8px_rgba(0,0,0,0.3)] transition-opacity duration-300"
                    style={{
                      opacity: buttonOpacity,
                      // Solid-ish white fallback for iOS 15 / browsers without backdrop-filter
                      backgroundColor: 'rgba(255,255,255,0.18)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                    }}
                  />
                  <Plus
                    className="w-5 h-5 md:w-6 md:h-6 relative"
                    style={{ color: '#ffffff', stroke: '#ffffff', zIndex: 10 }}
                  />
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
              const isActive = !item.external && !(item as any).action && location.pathname.startsWith(item.path);
              
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

              if ((item as any).action === 'open-stages') {
                return (
                  <button
                    key={item.label}
                    onClick={() => openStagesModal()}
                    className="flex items-center justify-center h-12 md:h-14 flex-shrink-0 transition-all duration-200 text-white"
                    style={{ width: 'calc((50% - 24px) / 2)' }}
                  >
                    <item.icon className="w-5 h-5 md:w-6 md:h-6 transition-all duration-200 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={(e) => handleProtectedNavClick(e, item.path, (item as any).requiresAuth)}
                  className="relative flex items-center justify-center h-12 md:h-14 flex-shrink-0 transition-all duration-200 text-white"
                  style={{ width: 'calc((50% - 24px) / 2)' }}
                >
                  <div className="relative">
                    <item.icon
                      className={cn(
                        'w-5 h-5 md:w-6 md:h-6 transition-all duration-200',
                        isActive
                          ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                          : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]'
                      )}
                    />
                    {item.label === 'Prompt' && (
                      <span className="absolute -top-2 -right-3 px-1 h-[12px] flex items-center justify-center bg-white/90 text-black text-[8px] font-bold rounded-md leading-none tracking-wide uppercase shadow-sm">
                        Test
                      </span>
                    )}
                  </div>
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
