import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Plus, Bell, User, Search, Trophy, Bookmark, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';

const ALL_NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: Plus, label: 'Create', path: null, isCreate: true },
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
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const [createButtonOpacity, setCreateButtonOpacity] = useState(1);

  useEffect(() => {
    const container = scrollRef.current;
    const createButton = createButtonRef.current;
    if (!container || !createButton) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = createButton.getBoundingClientRect();
      
      // Calculate how centered the button is
      const containerCenter = containerRect.left + containerRect.width / 2;
      const buttonCenter = buttonRect.left + buttonRect.width / 2;
      const distanceFromCenter = Math.abs(containerCenter - buttonCenter);
      const maxDistance = containerRect.width / 3;
      
      // Fade based on distance from center (1 when centered, 0 when far)
      const opacity = Math.max(0, 1 - distanceFromCenter / maxDistance);
      setCreateButtonOpacity(opacity);
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl overflow-hidden">
          {/* Scrollable nav items */}
          <div 
            ref={scrollRef}
            className="flex items-center justify-around h-14 overflow-x-auto scrollbar-hide scroll-smooth px-2"
            style={{ scrollSnapType: 'x proximity' }}
          >
            {ALL_NAV_ITEMS.map((item, index) => {
              if (item.isCreate) {
                return (
                  <button
                    key="create"
                    ref={createButtonRef}
                    onClick={() => setIsPostModalOpen(true)}
                    className="flex-shrink-0 w-12 h-12 flex items-center justify-center"
                  >
                    <div 
                      className="w-10 h-10 rounded-full bg-white flex items-center justify-center transition-all duration-200"
                      style={{ 
                        opacity: 0.4 + createButtonOpacity * 0.6,
                        transform: `scale(${0.85 + createButtonOpacity * 0.15})`
                      }}
                    >
                      <Plus className="w-6 h-6 text-black" />
                    </div>
                  </button>
                );
              }

              const isActive = item.path === '/app' 
                ? location.pathname === '/app'
                : location.pathname.startsWith(item.path!);
              
              return (
                <NavLink
                  key={item.path}
                  to={item.path!}
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
        </nav>
      </div>

      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
