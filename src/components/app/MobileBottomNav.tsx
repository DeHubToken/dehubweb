import { useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Plus, Bell, User, Search, Trophy, Bookmark, Settings, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragThreshold = 50;

  const handleDragEnd = (event: any, info: any) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset < -dragThreshold || velocity < -500) {
      // Swiped left - show secondary
      setShowSecondary(true);
    } else if (offset > dragThreshold || velocity > 500) {
      // Swiped right - show primary
      setShowSecondary(false);
    }
    animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
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
          ref={containerRef}
          className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl overflow-hidden relative"
        >
          {/* Page indicator dots */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              !showSecondary ? "bg-white" : "bg-zinc-600"
            )} />
            <div className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              showSecondary ? "bg-white" : "bg-zinc-600"
            )} />
          </div>

          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x }}
            className="cursor-grab active:cursor-grabbing"
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
          </motion.div>

          {/* Swipe hint arrows */}
          <button 
            onClick={() => setShowSecondary(false)}
            className={cn(
              "absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full transition-opacity",
              showSecondary ? "opacity-50 hover:opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            <ChevronLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <button 
            onClick={() => setShowSecondary(true)}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full transition-opacity",
              !showSecondary ? "opacity-50 hover:opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>
        </nav>
      </div>

      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </>
  );
}
