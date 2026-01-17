import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/app.types';

interface SidebarNavItemProps {
  item: NavItem;
  isActive: boolean;
  isHome: boolean;
  currentPath: string;
  onNavigate?: () => void;
  variant?: 'mobile' | 'desktop';
}

export function SidebarNavItem({ 
  item, 
  isActive, 
  isHome, 
  currentPath, 
  onNavigate,
  variant = 'desktop' 
}: SidebarNavItemProps) {
  const navigate = useNavigate();
  
  const handleClick = (e: React.MouseEvent) => {
    if (isHome) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('home-refresh'));
      navigate('/app');
    }
    onNavigate?.();
  };

  if (item.external) {
    return (
      <a
        href={item.path}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-4 w-full px-3 py-3.5 rounded-xl transition-colors text-white text-base',
          variant === 'mobile'
            ? 'hover:bg-zinc-700/50'
            : 'hover:bg-zinc-800/50'
        )}
      >
        <div className="w-11 h-11 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <item.icon className="w-6 h-6" />
        </div>
        <span className="truncate">{item.label}</span>
      </a>
    );
  }

  return (
    <NavLink
      to={item.path}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-4 w-full px-3 py-3.5 rounded-xl transition-colors text-white text-base',
        isActive
          ? variant === 'mobile'
            ? 'bg-zinc-700/50 font-semibold'
            : 'bg-zinc-800 font-semibold'
          : variant === 'mobile'
            ? 'hover:bg-zinc-700/50'
            : 'hover:bg-zinc-800/50'
      )}
    >
      <div className={cn(
        "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
        isActive ? "bg-zinc-700" : "bg-zinc-800"
      )}>
        <item.icon className="w-6 h-6" />
      </div>
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}
