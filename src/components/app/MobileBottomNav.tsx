import { useState, useRef } from 'react';
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

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl overflow-hidden relative">
          {/* Center Create Button */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center pointer-events-auto"
            >
              <Plus className="w-6 h-6 text-black" />
            </button>
          </div>

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
                      'flex items-center justify-center h-14 flex-1 transition-colors',
                      index === 0 && 'rounded-l-2xl',
                      isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                    )}
                  >
                    <item.icon className={cn('w-6 h-6', isActive && 'text-white')} />
                  </NavLink>
                );
              })}
            </div>

            {/* Center spacer for create button */}
            <div className="flex-shrink-0 w-14" />

            {/* Right side items - 2 buttons visible, rest scrollable */}
            <div className="flex items-center flex-shrink-0" style={{ minWidth: 'calc(50% - 28px)' }}>
              {ALL_NAV_ITEMS.slice(2).map((item, index, arr) => {
                const isActive = item.path === '/app' 
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.path);
                const isLast = index === arr.length - 1;
                const isFirstTwo = index < 2;
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-center h-14 transition-colors flex-shrink-0',
                      isFirstTwo ? 'flex-1' : 'w-14',
                      isLast && 'rounded-r-2xl',
                      isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                    )}
                    style={{ minWidth: isFirstTwo ? undefined : '3.5rem' }}
                  >
                    <item.icon className={cn('w-6 h-6', isActive && 'text-white')} />
                  </NavLink>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
