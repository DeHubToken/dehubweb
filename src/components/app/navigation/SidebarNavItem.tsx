import { useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/app.types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Map nav item labels to i18n keys
const NAV_LABEL_KEYS: Record<string, string> = {
  Home: 'nav.home', Explore: 'nav.explore', Prompt: 'nav.prompt', Notifications: 'nav.notifications',
  Messages: 'nav.messages', Assistant: 'nav.assistant', Leaderboard: 'nav.leaderboard',
  Bookmarks: 'nav.bookmarks', Settings: 'nav.settings', Profile: 'nav.profile', Blog: 'nav.blog',
  'Command': 'nav.command', 'Command Centre': 'nav.commandCentre', Wallet: 'nav.wallet', Docs: 'nav.docs', 'Feature Requests': 'nav.featureRequests', Staking: 'nav.staking', Governance: 'nav.governance', Communities: 'nav.communities', Events: 'nav.events', Careers: 'nav.careers', Glossary: 'nav.glossary', Guide: 'nav.guide',
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
  /** Optional callback to register the active desktop nav item DOM node for an overlay indicator */
  registerActiveRef?: (el: HTMLElement | null) => void;
  /** App theme so light and minimal can be styled independently */
  theme?: string;
}

function getDesktopTextColor(theme?: string) {
  // Light theme uses black text on light surfaces; minimal/dark/system use white.
  if (theme === 'light') return 'text-black';
  return 'text-white';
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
  registerActiveRef,
  theme,
}: SidebarNavItemProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const translatedLabel = t(NAV_LABEL_KEYS[item.label] || item.label);
  const itemRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const isDesktop = variant === 'desktop';
  const desktopTextColor = getDesktopTextColor(theme);

  useEffect(() => {
    if (isDesktop && isActive && registerActiveRef) {
      registerActiveRef(itemRef.current);
      return () => registerActiveRef(null);
    }
  }, [isDesktop, isActive, registerActiveRef]);
  
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

  const showAvatar = avatarUrl !== undefined;
  
  const isForceCollapsed = forceCollapsed;
  const collapsedItemClass = collapsed
    ? isForceCollapsed
      ? 'w-9 h-9 justify-center px-0'
      : 'w-9 h-9 lg:w-full lg:h-auto justify-center lg:justify-start px-0 lg:px-2.5 lg:py-2.5 lg:gap-3'
    : 'gap-3 px-2.5 py-2.5';
  const labelClass = isForceCollapsed ? "hidden" : collapsed ? "hidden lg:inline" : "";

  // Shared glass indicator element — key forces full remount on collapse toggle
  // Use smaller radius in collapsed mode so 36×36 icons don't look circular
  const indicatorRadius = (collapsed && !isForceCollapsed) ? 'rounded-2xl lg:rounded-2xl' : isForceCollapsed ? 'rounded-xl' : 'rounded-2xl';
  const isCollapsedSquare = isDesktop && (isForceCollapsed || (collapsed));
  const glassIndicator = isActive && !isDesktop && (
    <motion.div
      key={layoutId}
      layoutId={layoutId}
      className={cn(
        "absolute inset-0 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]",
        isCollapsedSquare ? 'rounded-xl' : 'rounded-2xl'
      )}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    />
  );

  if (item.external) {
    return (
      <a
        ref={itemRef as React.Ref<HTMLAnchorElement>}
        href={item.path}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={cn(
          'relative flex items-center rounded-2xl transition-[font-weight] text-[15px]',
          isDesktop ? desktopTextColor : 'text-white',
          isDesktop ? collapsedItemClass : 'gap-3.5 px-3 py-3',
          isDesktop && 'hover:font-semibold'
        )}
      >
        {glassIndicator}
        <div className={cn(
          "relative z-10 rounded-xl flex items-center justify-center flex-shrink-0",
          isDesktop ? "w-9 h-9" : "w-10 h-10",
          isDesktop
            ? isActive ? "bg-transparent" : (collapsed && !isForceCollapsed) ? "bg-transparent lg:bg-zinc-800" : isForceCollapsed ? "bg-transparent" : "bg-zinc-800"
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

  // Action items (like Stages) render as buttons, not links
  if (item.action) {
    return (
      <button
        ref={itemRef as React.Ref<HTMLButtonElement>}
        onClick={(e) => {
          onClick?.(e);
          onNavigate?.();
        }}
        className={cn(
          'relative flex items-center rounded-2xl transition-colors text-[15px] w-full text-left',
          isDesktop ? desktopTextColor : 'text-white',
          isDesktop ? collapsedItemClass : 'gap-3.5 px-3 py-3',
          !isActive && (variant === 'mobile' ? 'hover:bg-zinc-700/50' : 'hover:bg-zinc-800/50')
        )}
      >
        {glassIndicator}
        <div className={cn(
          "relative z-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
          isDesktop ? "w-9 h-9" : "w-10 h-10",
          isDesktop
            ? isActive ? "bg-transparent" : (collapsed && !isForceCollapsed) ? "bg-transparent lg:bg-zinc-800" : isForceCollapsed ? "bg-transparent" : "bg-zinc-800"
            : isActive
              ? "bg-white/[0.10] backdrop-blur-sm border border-white/[0.12]"
              : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
        </div>
        <span className={cn("relative z-10 truncate", labelClass)}>{translatedLabel}</span>
      </button>
    );
  }

  return (
    <NavLink
      ref={itemRef as React.Ref<HTMLAnchorElement>}
      to={item.path}
      onClick={handleClick}
      className={cn(
        'relative flex items-center rounded-2xl transition-colors text-[15px]',
        isDesktop ? desktopTextColor : 'text-white',
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
              : (collapsed && !isForceCollapsed) ? "bg-transparent lg:bg-zinc-800" : isForceCollapsed ? "bg-transparent" : "bg-zinc-800"
            : isActive
              ? "bg-white/[0.10] backdrop-blur-sm border border-white/[0.12]"
              : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08]"
        )}>
          <item.icon className={cn(isDesktop ? "w-5 h-5" : "w-[22px] h-[22px]")} />
          {notificationCount !== undefined && notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full z-20 leading-none">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
          {(item.label === 'Prompt' || item.label === 'Work' || item.label === 'Stores') && (
            <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 px-1 h-[10px] flex items-center justify-center bg-white/90 text-black text-[6px] font-bold rounded-sm z-20 leading-none tracking-wide uppercase shadow-sm whitespace-nowrap">
              Test
            </span>
          )}

        </div>
      )}
      <span className={cn("relative z-10 truncate", labelClass)}>{translatedLabel}</span>
    </NavLink>
  );
}
