import { ElectricLogo } from './ElectricLogo';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { openNotificationsDrawer } from '../NotificationsDrawer';
import { useLocation, useNavigate } from 'react-router-dom';
import { isHomePath } from '@/lib/home-path';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { Menu, Bell } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';

import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { buildAvatarUrl } from '@/lib/media-url';
import { useCallback, useLayoutEffect, useRef, memo } from 'react';
import { useAnyOverlayOpen } from '@/lib/overlay-open';
import { useScrollDirection } from '@/hooks/use-scroll-direction';
import { useAppTheme } from '@/contexts/ThemeContext';
import { WarLogo } from '@/components/app/war/WarLogoLazy';
import { warmLoginSheet } from '@/components/app/LoginModal';
// The centred slot is narrow, so this bar wears the bare mark rather than the
// wordmark. Same asset the collapsed desktop rail uses; it is a white PNG, and
// the light theme's `header … img[alt="dehub"]` rule inverts it to ink on paper
// — so it must NOT be swapped for the black mark here the way the rail does it,
// or light mode would invert a black mark back to white.
import dehubMark from '@/assets/dehub-logo-compact.png';
import { scrollDocumentToSmooth } from '@/lib/document-scroll';
import { FeedIslandCapsule } from './FeedIslandCapsule';

const HeaderLogo = memo(function HeaderLogo({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const { theme } = useAppTheme();
  return (
    <button onClick={onClick} className="block cursor-pointer" aria-label="dehub home">
      <ElectricLogo>{theme === 'war' ? (
        // Fixed width here rather than w-auto: the hologram is a canvas, which
        // has no intrinsic aspect ratio to derive a width from.
        <WarLogo src={dehubMark} alt="dehub" className="h-7 w-[33px]" />
      ) : (
        <img
          src={dehubMark}
          alt="dehub"
          className="h-7 w-auto"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          width={33}
          height={28}
        />
      )}</ElectricLogo>
    </button>
  );
});

interface MobileHeaderProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function MobileHeader({ isOpen, onOpenChange, children }: MobileHeaderProps) {
  const { t } = useTranslation();
  const { openPostModal } = useGlobalDropZone();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, openLoginModal } = useAuth();
  
  // Drop below every overlay scrim (dialog/sheet z-50, drawer z-100) while a
  // sheet is open — at the usual z-60 the header floats crisp above dialog
  // backdrops instead of dimming with the page (lib/overlay-open).
  const anyOverlayOpen = useAnyOverlayOpen();
  // Same hide-on-scroll-down / show-on-scroll-up behaviour as the mobile nav bars.
  const navVisible = useScrollDirection();
  const { theme } = useAppTheme();
  // System theme: no bar at all. The island capsule (FeedIslandCapsule) is the
  // home feed's only top chrome; the header stays mounted, hidden, for its menu
  // drawer.
  const islandBar = theme === 'system';
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: customUnread } = useCustomUnreadCount();
  const totalNotifUnread = (unreadCount?.total ?? 0) + (customUnread ?? 0);

  // Use ref for pathname so handleLogoClick is stable across renders
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isHomePath(pathnameRef.current)) {
      scrollDocumentToSmooth();
    } else {
      navigate('/app');
    }
  }, [navigate]);

  const isNotificationsActive = location.pathname === '/app/notifications' || location.pathname === '/notifications';
  // With or without the /app prefix — both spellings reach the same page.
  const isPostPage = /^\/(?:app\/)?(?:post|video)\//.test(location.pathname);
  // When the post overlay is opened from the feed, the home page's sticky tab bar hosts
  // the back button (settings-toggle slot). The top DEHUB bar stays exactly as it was on the feed.
  const isOverlayFromFeed = isPostPage && !!(location.state as any)?.fromFeed;
  // The bar (menu, dehub mark, bell) belongs to the home feed only. Every
  // other page already names itself in its own pill, so the bar there was a
  // second banner over it. It stays over the post overlay opened from the
  // feed, which is still the home feed underneath.
  //
  // Hidden, not unmounted: the menu drawer lives inside, and a menu item
  // navigates away while the sheet is still sliding shut.
  const showBar = isHomeFeedRoute(location.pathname) || isOverlayFromFeed;
  // Pages read this to drop the bar's 2.75rem clearance (index.css).
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-no-top-bar', !showBar || islandBar);
  }, [showBar, islandBar]);

  const handleMenuClick = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
    }
  }, [isAuthenticated, openLoginModal]);

  // This button IS the login entry when signed out (rendered only then), so
  // touch-start warms the login sheet — first-open mount dance and body chunk
  // land before the tap completes, and the drawer swings up on the same frame.
  const warmSheetForLogin = useCallback(() => {
    if (!isAuthenticated) warmLoginSheet();
  }, [isAuthenticated]);

  return (
    <>
    <header data-mobile-header data-clear-top-bar className={`${showBar && !islandBar ? '' : 'hidden '}lg:hidden fixed top-0 left-0 right-0 ${anyOverlayOpen ? 'z-[40]' : 'z-[60]'} px-4 h-11 flex items-center justify-between pointer-events-auto transition-transform duration-300 ease-in-out ${(!navVisible && !isOpen && !anyOverlayOpen) ? '-translate-y-full' : 'translate-y-0'} ${isOpen ? 'bg-transparent' : 'bg-black'}`}>
      {/* Profile — left slot.
          Direct post-page URL access: back button replaces the menu/settings toggle.
          When opened as an overlay from the feed, the feed's tab bar already hosts a back button,
          so we keep the normal menu/avatar here to preserve the "you never left the feed" feel. */}
      <div className="flex items-center">
        {isAuthenticated ? (
          <Drawer open={isOpen} onOpenChange={onOpenChange}>

            <DrawerTrigger asChild>
              {user ? (
                <button
                  className="rounded-lg hover:opacity-80 transition-opacity"
                  aria-label="Toggle menu"
                >
                  <Avatar className="w-[27px] h-[27px]">
                    {user.avatarImageUrl && user.address && (
                      <AvatarImage
                        src={buildAvatarUrl(user.address, user.avatarImageUrl)}
                        alt={`${user.displayName || user.username}'s avatar`}
                        className="object-cover"
                        loading="eager"
                      />
                    )}
                    <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
                      {(user.displayName || user.username)?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <button
                  className="p-2 rounded-lg transition-colors -ml-2"
                  aria-label="Toggle menu"
                >
                  <Menu className="w-[31px] h-[31px] text-white" />
                </button>
              )}
            </DrawerTrigger>
            {/* 85dvh, not 85vh: `vh` is the LARGE viewport, measured as if the
                browser chrome were hidden, while the sheet's `bottom-0` sits at
                the bottom of what is actually on screen. On iOS Safari that
                pushed the top of the menu — the search field — off the top of
                the screen, with no way to scroll it back into view. */}
            <DrawerContent glass className="max-h-[85dvh]" aria-describedby={undefined}>
              <DrawerTitle className="sr-only">{t('sidebar.searchMenu')}</DrawerTitle>
              {/* Column, not a scroller: the menu pins its profile + search to
                  the top and its account actions to the bottom, and scrolls
                  only the tiles between them — same as the app. */}
              <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
                {children}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <button
            onClick={handleMenuClick}
            onPointerDown={warmSheetForLogin}
            className="p-2 rounded-lg transition-colors -ml-2"
            aria-label="Log in"
          >
            <Menu className="w-[31px] h-[31px] text-white" />
          </button>
        )}
      </div>

      {/* dehub mark — centred on the bar itself, not between the side slots, so
          it stays put whether or not the notification bell is rendered (it is
          signed-in only) and whichever left control is showing. */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center">
        <HeaderLogo onClick={handleLogoClick} />
      </div>

      {/* Notifications — right slot, only visible when logged in.
          When the post overlay is opened from the feed, keep the DEHUB header exactly as it was. */}
      <div className="flex items-center">
        {isAuthenticated && (
          <button
            onClick={() => openNotificationsDrawer()}
            className={`relative flex items-center justify-center transition-colors ${isNotificationsActive ? 'text-white' : 'text-zinc-400'}`}
            aria-label="Notifications"
          >
            <Bell className="w-[26px] h-[26px]" />
            {totalNotifUnread > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-[4px] bg-red-500 text-white text-[10px] font-bold rounded-[6px] flex items-center justify-center leading-none">
                {totalNotifUnread > 99 ? '99+' : totalNotifUnread}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
    {islandBar && showBar && (
      <FeedIslandCapsule
        visible={navVisible && !isOpen && !anyOverlayOpen && !isPostPage}
        avatar={isAuthenticated && user ? (
          <Avatar className="w-[28px] h-[28px] rounded-lg">
            {user.avatarImageUrl && user.address && (
              <AvatarImage
                src={buildAvatarUrl(user.address, user.avatarImageUrl)}
                alt=""
                className="object-cover rounded-lg"
              />
            )}
            <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium rounded-lg">
              {(user.displayName || user.username)?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        ) : null}
        onAvatarClick={() => (isAuthenticated ? onOpenChange(true) : openLoginModal())}
        onCreatePost={() => (isAuthenticated ? openPostModal() : openLoginModal())}
        logoSrc={dehubMark}
        unread={isAuthenticated ? totalNotifUnread : 0}
        onBellClick={() => (isAuthenticated ? openNotificationsDrawer() : openLoginModal())}
      />
    )}
    </>
  );
}
