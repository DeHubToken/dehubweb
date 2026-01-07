import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, Plus, User, Search, Trophy, Bookmark, Settings, LayoutDashboard, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';
import { GeneralAIChat } from './chat/GeneralAIChat';

// Left side: Home, Messages
const LEFT_NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: MessageSquare, label: 'Messages', path: '/app/messages' },
];

// Right side: Explore, AI button (special)
const RIGHT_NAV_ITEMS = [
  { icon: Search, label: 'Explore', path: '/app/explore' },
];

const SCROLL_NAV_ITEMS = [
  { icon: User, label: 'Profile', path: '/app/profile' },
  { icon: LayoutDashboard, label: 'Command', path: '/app/command-centre' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    // If clicking Home while already on Home, trigger refresh
    if (path === '/app' && location.pathname === '/app') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('home-refresh'));
      navigate('/app');
    }
  };

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
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-[95%] md:max-w-md shadow-xl overflow-hidden">
          {/* Nav items container */}
          <div 
            ref={scrollRef}
            className="flex items-center h-12 md:h-14 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollSnapType: 'x proximity' }}
          >
            {/* Left side items - Home + Messages */}
            <div className="flex items-center flex-shrink-0" style={{ width: 'calc(50% - 24px)' }}>
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
                        item.label === 'Messages' && '-ml-[2px]'
                      )} 
                    />
                  </NavLink>
                );
              })}
            </div>

            {/* Center Create Button - fades as user scrolls */}
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center"
            >
              <div 
                className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-300"
                style={{ 
                  backgroundColor: `rgba(255, 255, 255, ${buttonOpacity})`,
                }}
              >
                <Plus 
                  className="w-5 h-5 md:w-6 md:h-6 transition-colors duration-300" 
                  style={{ color: buttonOpacity > 0.5 ? 'black' : 'white' }}
                />
              </div>
            </button>

            {/* Right side items - Explore + AI button */}
            <div className="flex items-center flex-shrink-0" style={{ width: 'calc(50% - 24px)' }}>
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
                        item.label === 'Explore' && 'ml-[2px]'
                      )} 
                    />
                  </NavLink>
                );
              })}
              
              {/* AI Button */}
              <button
                onClick={() => setIsAIChatOpen(true)}
                className="flex items-center justify-center h-12 md:h-14 flex-1 transition-all duration-200 text-white rounded-r-2xl"
              >
                <Sparkles 
                  className={cn(
                    'w-5 h-5 md:w-6 md:h-6 transition-all duration-200',
                    isAIChatOpen 
                      ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]' 
                      : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]'
                  )} 
                />
              </button>
            </div>

            {/* Additional items - accessible via scroll */}
            {SCROLL_NAV_ITEMS.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
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
      <GeneralAIChat isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} />
    </>
  );
}
