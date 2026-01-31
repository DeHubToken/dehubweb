import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/app.types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface SidebarNavItemProps {
  item: NavItem;
  isActive: boolean;
  isHome: boolean;
  currentPath: string;
  onNavigate?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'mobile' | 'desktop';
  avatarUrl?: string | null;
  avatarFallback?: string;
  notificationCount?: number;
}

export function SidebarNavItem({ 
  item, 
  isActive, 
  isHome, 
  currentPath, 
  onNavigate,
  onClick,
  variant = 'desktop',
  avatarUrl,
  avatarFallback,
  notificationCount,
}: SidebarNavItemProps) {
  const navigate = useNavigate();
  
  const handleClick = (e: React.MouseEvent) => {
    // Call custom onClick first if provided
    onClick?.(e);
    
    // If onClick prevented default, stop here
    if (e.defaultPrevented) return;
    
    if (isHome) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('home-refresh'));
      navigate('/app');
    }
    onNavigate?.();
  };

  // Desktop variant uses smaller sizing (10% reduction)
  const isDesktop = variant === 'desktop';

  // Check if we should render avatar instead of icon
  const showAvatar = avatarUrl !== undefined;

  if (item.external) {
    return (
      <a
        href={item.path}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={cn(
          'flex items-center w-full rounded-xl transition-colors text-white',
          isDesktop 
            ? 'gap-3 px-2.5 py-2.5 text-[15px]' 
            : 'gap-3.5 px-3 py-3 text-[15px]',
          variant === 'mobile'
            ? 'hover:bg-zinc-700/50'
            : 'hover:bg-zinc-800/50'
        )}
      >
        <div className={cn(
          "rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0",
          isDesktop ? "w-9 h-9" : "w-10 h-10"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
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
        'flex items-center w-full rounded-xl transition-colors text-white',
        isDesktop 
          ? 'gap-3 px-2.5 py-2.5 text-[15px]' 
          : 'gap-3.5 px-3 py-3 text-[15px]',
        isActive
          ? variant === 'mobile'
            ? 'bg-zinc-700/50 font-semibold'
            : 'bg-zinc-800 font-semibold'
          : variant === 'mobile'
            ? 'hover:bg-zinc-700/50'
            : 'hover:bg-zinc-800/50'
      )}
    >
      {showAvatar ? (
        <Avatar className={cn(
          "flex-shrink-0 rounded-xl",
          isDesktop ? "w-9 h-9" : "w-10 h-10"
        )}>
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt="Profile" className="object-cover rounded-xl" />
          )}
          <AvatarFallback className="bg-zinc-700 text-white font-medium text-sm rounded-xl">
            {avatarFallback || 'U'}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className={cn(
          "rounded-xl flex items-center justify-center flex-shrink-0 transition-colors relative",
          isDesktop ? "w-9 h-9" : "w-10 h-10",
          isActive ? "bg-zinc-700" : "bg-zinc-800"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
          {notificationCount !== undefined && notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </div>
      )}
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}
