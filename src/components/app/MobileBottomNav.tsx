import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Plus, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostModal } from './PostModal';

const NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: null, label: 'Create', path: null }, // Placeholder for create button
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: User, label: 'Profile', path: '/app/profile' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
        <nav className="bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-md shadow-xl">
          <div className="flex items-center justify-around h-14">
            {NAV_ITEMS.map((item) => {
              // Create button
              if (item.path === null) {
                return (
                  <button
                    key="create"
                    onClick={() => setIsPostModalOpen(true)}
                    className="flex items-center justify-center flex-1 h-full"
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
                    'flex items-center justify-center flex-1 h-full rounded-xl transition-colors',
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
