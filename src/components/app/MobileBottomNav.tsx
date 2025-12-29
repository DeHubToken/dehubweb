import { NavLink, useLocation } from 'react-router-dom';
import { Home, Mail, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: Mail, label: 'Messages', path: '/app/messages' },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: User, label: 'Profile', path: '/app/profile' },
];

export function MobileBottomNav() {
  const location = useLocation();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2">
      <nav className="bg-zinc-900 rounded-2xl mx-auto max-w-md">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.map((item) => {
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
  );
}
