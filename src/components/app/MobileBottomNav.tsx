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
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20">
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
            >
              <Plus className="w-6 h-6 text-black" />
            </button>
          </div>

          {/* Scrollable nav items */}
          <div 
            ref={scrollRef}
            className="flex items-center h-14 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollSnapType: 'x proximity' }}
          >
            {/* Left side items */}
            <div className="flex items-center justify-around flex-shrink-0" style={{ width: 'calc(50% - 28px)' }}>
              {ALL_NAV_ITEMS.slice(0, 2).map((item) => {
                const isActive = item.path === '/app' 
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-center w-12 h-12 rounded-xl transition-colors',
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

            {/* Right side items (scrollable) */}
            <div className="flex items-center gap-1 flex-shrink-0 pr-3">
              {ALL_NAV_ITEMS.slice(2).map((item) => {
                const isActive = item.path === '/app' 
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-center w-12 h-12 rounded-xl transition-colors flex-shrink-0',
                      isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                    )}
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
