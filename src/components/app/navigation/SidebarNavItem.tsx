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
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors',
          variant === 'mobile'
            ? 'text-zinc-400 hover:bg-zinc-700/50 hover:text-white'
            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
        )}
      >
        <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
          <item.icon className="w-5 h-5" />
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
        'flex items-center w-full rounded-xl transition-colors',
        variant === 'mobile' ? 'gap-3 px-3 py-2.5' : 'gap-2.5 px-2.5 py-2',
        isActive
          ? variant === 'mobile'
            ? 'bg-zinc-700/50 text-white font-semibold'
            : 'bg-zinc-800 text-white font-semibold'
          : variant === 'mobile'
            ? 'text-zinc-400 hover:bg-zinc-700/50 hover:text-white'
            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
      )}
    >
      <div className={cn(
        "rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
        variant === 'mobile' ? 'w-9 h-9' : 'w-8 h-8',
        isActive ? "bg-zinc-700" : "bg-zinc-800"
      )}>
        <item.icon className={cn(variant === 'mobile' ? 'w-5 h-5' : 'w-4.5 h-4.5')} />
      </div>
      <span className={cn("truncate", variant === 'desktop' && 'text-[0.9rem]')}>{item.label}</span>
    </NavLink>
  );
}
