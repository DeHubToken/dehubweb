import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Plus, Bell, User, Search, Trophy, Bookmark, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';
import { motion, AnimatePresence } from 'framer-motion';

const PRIMARY_NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: null, label: 'Create', path: null }, // Placeholder for create button
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: User, label: 'Profile', path: '/app/profile' },
];

const SECONDARY_NAV_ITEMS = [
  { icon: Search, label: 'Explore', path: '/app/explore' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: null, label: 'Create', path: null }, // Placeholder for create button
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      setShowSecondary(true);
    } else if (isRightSwipe) {
      setShowSecondary(false);
    }
  };

  const renderNavItems = (items: typeof PRIMARY_NAV_ITEMS, isPrimary: boolean) => (
    <div className="flex items-center justify-around h-14 w-full">
      {items.map((item, index) => {
        // Create button
        if (item.path === null) {
          return (
            <button
              key={`create-${index}`}
              onClick={() => setIsPostModalOpen(true)}
              className="flex items-center justify-center flex-1 h-full"
            >
              <motion.div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                animate={{ 
                  backgroundColor: isPrimary ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0)',
                }}
                transition={{ duration: 0.2 }}
              >
                <Plus className={cn(
                  "w-6 h-6 transition-colors duration-200",
                  isPrimary ? "text-black" : "text-zinc-500"
                )} />
              </motion.div>
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
              'flex items-center justify-center flex-1 h-full rounded-xl transition-colors',
              isActive ? 'text-white bg-zinc-800' : 'text-zinc-500'
            )}
          >
            <item.icon className={cn('w-6 h-6', isActive && 'text-white')} />
          </NavLink>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav 
          className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <AnimatePresence mode="wait">
            {!showSecondary ? (
              <motion.div
                key="primary"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderNavItems(PRIMARY_NAV_ITEMS, true)}
              </motion.div>
            ) : (
              <motion.div
                key="secondary"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                {renderNavItems(SECONDARY_NAV_ITEMS, false)}
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      </div>

      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
