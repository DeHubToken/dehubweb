import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Plus, Bell, User, Search, Trophy, Bookmark, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';

const ALL_NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: User, label: 'Profile', path: '/app/profile' },
  { icon: Search, label: 'Explore', path: '/app/explore' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

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
        <nav className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl overflow-hidden">
          {/* Nav items container */}
          <div 
            ref={scrollRef}
            className="flex items-center h-14 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollSnapType: 'x proximity' }}
          >
            {/* Left side items - 2 buttons */}
            <div className="flex items-center flex-shrink-0" style={{ width: 'calc(50% - 28px)' }}>
              {ALL_NAV_ITEMS.slice(0, 2).map((item, index) => {
                const isActive = item.path === '/app' 
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-center h-14 flex-1 transition-colors rounded-xl',
                      index === 0 && 'rounded-l-2xl',
                      isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                    )}
                  >
                    <item.icon className={cn('w-6 h-6', isActive && 'text-white')} />
                  </NavLink>
                );
              })}
            </div>

            {/* Center Create Button - fades as user scrolls */}
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="flex-shrink-0 w-14 h-14 flex items-center justify-center"
            >
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150"
                style={{ 
                  backgroundColor: `rgba(255, 255, 255, ${buttonOpacity})`,
                }}
              >
                <Plus 
                  className="w-6 h-6 transition-colors duration-150" 
                  style={{ color: buttonOpacity > 0.5 ? 'black' : 'rgb(113, 113, 122)' }}
                />
              </div>
            </button>

            {/* Right side items - first 2 match left side width */}
            <div className="flex items-center flex-shrink-0" style={{ width: 'calc(50% - 28px)' }}>
              {ALL_NAV_ITEMS.slice(2, 4).map((item, index) => {
                const isActive = item.path === '/app' 
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-center h-14 flex-1 transition-colors rounded-xl',
                      index === 1 && 'rounded-r-2xl',
                      isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                    )}
                  >
                    <item.icon className={cn('w-6 h-6', isActive && 'text-white')} />
                  </NavLink>
                );
              })}
            </div>

            {/* Additional items - accessible via scroll, same width as main buttons */}
            {ALL_NAV_ITEMS.slice(4).map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center justify-center h-14 flex-shrink-0 transition-colors rounded-xl',
                    isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                  )}
                  style={{ width: 'calc((50% - 28px) / 2)' }}
                >
                  <item.icon className={cn('w-6 h-6', isActive && 'text-white')} />
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>

      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
