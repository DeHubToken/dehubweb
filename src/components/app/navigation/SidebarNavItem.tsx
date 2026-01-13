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
          'flex items-center w-full px-2.5 rounded-xl transition-colors text-white',
          variant === 'mobile'
            ? 'gap-3 py-2.5 hover:bg-zinc-700/50'
            : 'gap-2.5 py-2 hover:bg-zinc-800/50 text-sm'
        )}
      >
        <div className={cn(
          "rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0",
          variant === 'mobile' ? 'w-9 h-9 rounded-xl' : 'w-7 h-7'
        )}>
          <item.icon className={variant === 'mobile' ? 'w-5 h-5' : 'w-4 h-4'} />
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
        'flex items-center w-full px-2.5 rounded-xl transition-colors text-white',
        variant === 'mobile' ? 'gap-3 py-2.5' : 'gap-2.5 py-2 text-sm',
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
        "flex items-center justify-center flex-shrink-0 transition-colors",
        variant === 'mobile' ? 'w-9 h-9 rounded-xl' : 'w-7 h-7 rounded-lg',
        isActive ? "bg-zinc-700" : "bg-zinc-800"
      )}>
        <item.icon className={variant === 'mobile' ? 'w-5 h-5' : 'w-4 h-4'} />
      </div>
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}
