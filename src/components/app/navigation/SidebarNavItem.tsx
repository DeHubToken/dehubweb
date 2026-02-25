import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/app.types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Map nav item labels to i18n keys
const NAV_LABEL_KEYS: Record<string, string> = {
  Home: 'nav.home', Explore: 'nav.explore', Notifications: 'nav.notifications',
  Messages: 'nav.messages', Assistant: 'nav.assistant', Leaderboard: 'nav.leaderboard',
  Bookmarks: 'nav.bookmarks', Settings: 'nav.settings', Profile: 'nav.profile', Blog: 'nav.blog',
  'Command Centre': 'nav.commandCentre', Wallet: 'nav.wallet', Docs: 'nav.docs', 'Feature Requests': 'nav.featureRequests', Careers: 'nav.careers',
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
  /** When true, labels are always hidden (overrides xl: breakpoint show) */
  forceCollapsed?: boolean;
  avatarUrl?: string | null;
  avatarFallback?: string;
  notificationCount?: number;
  /** Layout group for smooth sliding indicator */
  layoutId?: string;
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
  forceCollapsed = false,
  avatarUrl,
  avatarFallback,
  notificationCount,
  layoutId = 'sidebar-nav',
}: SidebarNavItemProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const translatedLabel = t(NAV_LABEL_KEYS[item.label] || item.label);
  
  const handleClick = (e: React.MouseEvent) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    
    if (isHome) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('home-refresh'));
      navigate('/app');
    }
    onNavigate?.();
  };

  const isDesktop = variant === 'desktop';
  const showAvatar = avatarUrl !== undefined;
  
  const isForceCollapsed = forceCollapsed;
  const collapsedItemClass = collapsed
    ? isForceCollapsed
      ? 'w-9 h-9 justify-center px-0'
      : 'w-9 h-9 xl:w-full xl:h-auto justify-center xl:justify-start px-0 xl:px-2.5 xl:py-2.5 xl:gap-3'
    : 'gap-3 px-2.5 py-2.5';
  const labelClass = isForceCollapsed ? "hidden" : collapsed ? "hidden xl:inline" : "";

  // Shared glass indicator element
  const glassIndicator = isActive && (
    <motion.div
      layoutId={layoutId}
      className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    />
  );

  if (item.external) {
    return (
      <a
        href={item.path}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={cn(
          'relative flex items-center rounded-xl transition-colors text-white text-[15px]',
          isDesktop ? collapsedItemClass : 'gap-3.5 px-3 py-3',
          !isActive && (variant === 'mobile' ? 'hover:bg-zinc-700/50' : 'hover:bg-zinc-800/50')
        )}
      >
        {glassIndicator}
        <div className={cn(
          "relative z-10 rounded-xl flex items-center justify-center flex-shrink-0",
          isDesktop ? "w-9 h-9" : "w-10 h-10",
          isDesktop
            ? isActive ? "bg-transparent" : (collapsed && !isForceCollapsed) ? "bg-transparent xl:bg-zinc-800" : isForceCollapsed ? "bg-transparent" : "bg-zinc-800"
            : isActive
              ? "bg-white/[0.10] backdrop-blur-sm border border-white/[0.12]"
              : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
        </div>
        <span className={cn("relative z-10 truncate", labelClass)}>{translatedLabel}</span>
      </a>
    );
  }

  return (
    <NavLink
      to={item.path}
      onClick={handleClick}
      className={cn(
        'relative flex items-center rounded-xl transition-colors text-white text-[15px]',
        isDesktop ? collapsedItemClass : 'gap-3.5 px-3 py-3',
        isActive ? 'font-semibold' : '',
        !isActive && (variant === 'mobile' ? 'hover:bg-zinc-700/50' : 'hover:bg-zinc-800/50')
      )}
    >
      {glassIndicator}
      {showAvatar ? (
        <Avatar className={cn(
          "relative z-10 flex-shrink-0 rounded-xl",
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
          "relative z-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
          isDesktop ? "w-9 h-9" : "w-10 h-10",
          isDesktop
            ? isActive 
              ? "bg-transparent" 
              : (collapsed && !isForceCollapsed) ? "bg-transparent xl:bg-zinc-800" : isForceCollapsed ? "bg-transparent" : "bg-zinc-800"
            : isActive
              ? "bg-white/[0.10] backdrop-blur-sm border border-white/[0.12]"
              : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
          {notificationCount !== undefined && notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full z-20">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </div>
      )}
      <span className={cn("relative z-10 truncate", labelClass)}>{translatedLabel}</span>
    </NavLink>
  );
}
