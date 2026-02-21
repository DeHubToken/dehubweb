import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/app.types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Map nav item labels to i18n keys
const NAV_LABEL_KEYS: Record<string, string> = {
  Home: 'nav.home', Explore: 'nav.explore', Notifications: 'nav.notifications',
  Messages: 'nav.messages', Assistant: 'nav.assistant', Leaderboard: 'nav.leaderboard',
  Bookmarks: 'nav.bookmarks', Settings: 'nav.settings', Profile: 'nav.profile', Blog: 'nav.blog',
  'Command Centre': 'nav.commandCentre', Docs: 'nav.docs', Roadmap: 'nav.roadmap', Careers: 'nav.careers',
};

interface SidebarNavItemProps {
  item: NavItem;
  isActive: boolean;
  isHome: boolean;
  currentPath: string;
  onNavigate?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'mobile' | 'desktop';
  collapsed?: boolean;
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
  collapsed = false,
  avatarUrl,
  avatarFallback,
  notificationCount,
}: SidebarNavItemProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const translatedLabel = t(NAV_LABEL_KEYS[item.label] || item.label);
  
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
  
  // Collapsed: icon-only square button; Expanded: full-width row
  const collapsedItemClass = collapsed
    ? 'w-9 h-9 xl:w-full xl:h-auto justify-center xl:justify-start px-0 xl:px-2.5 xl:py-2.5 xl:gap-3'
    : 'gap-3 px-2.5 py-2.5';

  if (item.external) {
    return (
      <a
        href={item.path}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={cn(
          'flex items-center rounded-xl transition-colors text-white text-[15px]',
          isDesktop ? collapsedItemClass : 'gap-3.5 px-3 py-3',
          variant === 'mobile'
            ? 'hover:bg-zinc-700/50'
            : 'hover:bg-zinc-800/50'
        )}
      >
        <div className={cn(
          "rounded-xl flex items-center justify-center flex-shrink-0",
          isDesktop ? "w-9 h-9" : "w-10 h-10",
          isDesktop
            ? collapsed ? "bg-transparent xl:bg-zinc-800" : "bg-zinc-800"
            : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
        </div>
        <span className={cn("truncate", collapsed && "hidden xl:inline")}>{translatedLabel}</span>
      </a>
    );
  }

  return (
    <NavLink
      to={item.path}
      onClick={handleClick}
      className={cn(
        'flex items-center rounded-xl transition-colors text-white text-[15px]',
        isDesktop ? collapsedItemClass : 'gap-3.5 px-3 py-3',
        isActive
          ? variant === 'mobile'
            ? 'bg-zinc-700/50 font-semibold'
            : collapsed
              ? 'xl:bg-zinc-800 bg-zinc-700 font-semibold'
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
          isDesktop
            ? isActive 
              ? "bg-zinc-700" 
              : collapsed ? "bg-transparent xl:bg-zinc-800" : "bg-zinc-800"
            : isActive
              ? "bg-white/[0.10] backdrop-blur-sm border border-white/[0.12]"
              : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
          {notificationCount !== undefined && notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </div>
      )}
      <span className={cn("truncate", collapsed && "hidden xl:inline")}>{translatedLabel}</span>
    </NavLink>
  );
}
