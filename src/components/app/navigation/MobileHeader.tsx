import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { isHomePath } from '@/lib/home-path';
import { Menu, Bell, ArrowLeft } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { CoinBalanceMenu } from '../CoinBalanceMenu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';

import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { buildAvatarUrl } from '@/lib/media-url';
import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useAnyOverlayOpen } from '@/lib/overlay-open';

const HeaderLogo = memo(function HeaderLogo({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} className="block cursor-pointer">
      <img
        src="/dehub-header-logo.png"
        alt="dehub"
        className="h-7 md:h-7 w-auto"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        width={93}
        height={28}
      />
    </button>
  );
});

interface MobileHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function MobileHeader({ isOpen, onToggle, children }: MobileHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const { isAuthenticated, user, openLoginModal } = useAuth();
  
  // Drop below every overlay scrim (dialog/sheet z-50, drawer z-100) while a
  // sheet is open — at the usual z-60 the header floats crisp above dialog
  // backdrops instead of dimming with the page (lib/overlay-open).
  const anyOverlayOpen = useAnyOverlayOpen();
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: customUnread } = useCustomUnreadCount();
  const totalNotifUnread = (unreadCount?.total ?? 0) + (customUnread ?? 0);

  // Coin balance
  const coinBalance = 0; // TODO: Get from user wallet

  // Use ref for pathname so handleLogoClick is stable across renders
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isHomePath(pathnameRef.current)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/app');
    }
  }, [navigate]);

  // Canvas themes render the header transparent at the top of the page and
  // frost it back to liquid glass once content scrolls underneath. The feed
  // can scroll on window, <html>, <body> or #app-root depending on browser,
  // so listen on all candidates (same approach as useScrollDirection) — an
  // IntersectionObserver sentinel misses body-scroll here.
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);
  useEffect(() => {
    const getY = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop ||
      document.getElementById('app-root')?.scrollTop || 0;
    const onScroll = () => {
      const next = getY() > 8;
      if (next !== scrolledRef.current) {
        scrolledRef.current = next;
        setScrolled(next);
      }
    };
    onScroll();
    const targets: EventTarget[] = [window, document, document.documentElement, document.body];
    const appRoot = document.getElementById('app-root');
    if (appRoot) targets.push(appRoot);
    targets.forEach((t) => t.addEventListener('scroll', onScroll, { passive: true }));
    return () => targets.forEach((t) => t.removeEventListener('scroll', onScroll));
  }, []);

  const isNotificationsActive = location.pathname === '/app/notifications';
  const isPostPage = location.pathname.startsWith('/app/post/') || location.pathname.startsWith('/app/video/');
  // When the post overlay is opened from the feed, the home page's sticky tab bar hosts
  // the back button (settings-toggle slot). The top DEHUB bar stays exactly as it was on the feed.
  const isOverlayFromFeed = isPostPage && !!(location.state as any)?.fromFeed;
  const handleMenuClick = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
    }
  }, [isAuthenticated, openLoginModal]);

  const handleBackClick = useCallback(() => {
    if (navType === 'POP') {
      navigate('/app');
    } else {
      navigate(-1);
    }
  }, [navType, navigate]);

  return (
    <header data-mobile-header data-scrolled={scrolled ? 'true' : 'false'} className={`lg:hidden fixed top-0 left-0 right-0 ${anyOverlayOpen ? 'z-[40]' : 'z-[60]'} px-4 h-11 flex items-center justify-between pointer-events-auto ${isOpen ? 'bg-transparent' : 'bg-black'}`}>
      <div className="flex items-center gap-3 ml-[-8px]">
        <HeaderLogo onClick={handleLogoClick} />
      </div>
      
      <div className="flex items-center gap-3">
        
        {/* Notifications Button - only visible when logged in.
            When the post overlay is opened from the feed, keep the DEHUB header exactly as it was. */}
        {isAuthenticated && (
          <button
            onClick={() => navigate('/app/notifications')}
            className={`relative flex items-center justify-center transition-colors ${isNotificationsActive ? 'text-white' : 'text-zinc-400'}`}
            aria-label="Notifications"
          >
            <Bell className="w-[26px] h-[26px]" />
            {totalNotifUnread > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-[4px] bg-red-500 text-white text-[10px] font-bold rounded-md flex items-center justify-center leading-none">
                {totalNotifUnread > 99 ? '99+' : totalNotifUnread}
              </span>
            )}
          </button>
        )}

        {/* Direct post-page URL access: back button replaces the menu/settings toggle.
            When opened as an overlay from the feed, the feed's tab bar already hosts a back button,
            so we keep the normal menu/avatar here to preserve the "you never left the feed" feel. */}
        {isAuthenticated ? (
          <Drawer open={isOpen} onOpenChange={onToggle}>

            <DrawerTrigger asChild>
              {user ? (
                <button
                  className="hover:opacity-80 transition-opacity"
                  aria-label="Toggle menu"
                >
                  <Avatar className="w-[27px] h-[27px]">
                    {user.avatarImageUrl && user.address && (
                      <AvatarImage
                        src={buildAvatarUrl(user.address, user.avatarImageUrl)}
                        alt={`${user.displayName || user.username}'s avatar`}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
                      {(user.displayName || user.username)?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button
                  className="p-2 rounded-full transition-colors mr-[-16.5px]"
                  aria-label="Toggle menu"
                >
                  <Menu className="w-[31px] h-[31px] text-white" />
                </button>
              )}
            </DrawerTrigger>
            <DrawerContent glass className="max-h-[85vh]">
              <div className="p-4 pb-8 overflow-y-auto">
                {children}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <button
            onClick={handleMenuClick}
            className="p-2 rounded-full transition-colors mr-[-16.5px]"
            aria-label="Log in"
          >
            <Menu className="w-[31px] h-[31px] text-white" />
          </button>
        )}
      </div>
    </header>
  );
}
