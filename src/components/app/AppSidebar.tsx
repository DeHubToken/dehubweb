import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 h-screen sticky top-0 p-4 flex flex-col border-r border-zinc-800">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">dehub</h1>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/app'
              ? location.pathname === '/app'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.label}
              to={item.path}
              className={cn(
                'flex items-center gap-4 w-full px-4 py-3 rounded-full transition-colors text-lg',
                isActive
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              )}
            >
              <item.icon className="w-6 h-6" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <Button className="w-full rounded-full bg-white text-black hover:bg-zinc-200 font-semibold py-6 text-lg">
        Post
      </Button>
    </aside>
  );
}
