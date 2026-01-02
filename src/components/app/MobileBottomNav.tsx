import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Plus, Bell, User, Search, Trophy, Bookmark, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';

const NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: Search, label: 'Explore', path: '/app/explore' },
  { icon: null, label: 'Create', path: null }, // Create button in center
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: User, label: 'Profile', path: '/app/profile' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl overflow-hidden">
          <div 
            className="flex items-center h-14 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {NAV_ITEMS.map((item, index) => {
              // Create button
              if (item.path === null) {
                return (
                  <button
                    key={`create-${index}`}
                    onClick={() => setIsPostModalOpen(true)}
                    className="flex items-center justify-center flex-shrink-0 w-16 h-full"
                  >
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                      <Plus className="w-6 h-6 text-black" />
                    </div>
                  </button>
                );
              }

              const isActive = item.path === '/app' 
                ? location.pathname === '/app'
                : location.pathname.startsWith(item.path);
              
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center justify-center flex-shrink-0 w-16 h-full rounded-xl transition-colors',
                    isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
                  )}
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
