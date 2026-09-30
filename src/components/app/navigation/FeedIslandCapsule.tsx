import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Menu } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { revealNav } from '@/hooks/use-scroll-direction';

const HOME_STATE_STORAGE_KEY = 'home-feed-state';

function readActiveTab(): string {
  try {
    const saved = sessionStorage.getItem(HOME_STATE_STORAGE_KEY);
    if (saved) {
      const { tab } = JSON.parse(saved);
      if (tab) return tab;
    }
  } catch { /* ignore */ }
  return 'home';
}

interface FeedIslandCapsuleProps {
  visible: boolean;
  avatar: React.ReactNode;
  onAvatarClick: () => void;
  logoSrc: string;
  onLogoClick: (e: React.MouseEvent) => void;
  showBell: boolean;
  unread: number;
  onBellClick: () => void;
}

/**
 * System theme, phones: while the feed scrolls down the top bar and tab pill
 * slide away and this small glass capsule takes their place, so the media runs
 * to the top of the screen and you still see where you are. Avatar and mark on
 * the left, the tab you are on in the middle (tap it for the full bar back),
 * the bell on the right. Sideways swipes between tabs are the feed's own and
 * pass under it untouched.
 */
export function FeedIslandCapsule({
  visible,
  avatar,
  onAvatarClick,
  logoSrc,
  onLogoClick,
  showBell,
  unread,
  onBellClick,
}: FeedIslandCapsuleProps) {
  const [tabValue, setTabValue] = useState(readActiveTab);
  useEffect(() => {
    const sync = () => setTabValue(readActiveTab());
    window.addEventListener('home-tab-changed', sync);
    return () => window.removeEventListener('home-tab-changed', sync);
  }, []);
  const tab = FEED_TABS.find((t) => t.value === tabValue) ?? FEED_TABS[0];
  const TabIcon = tab.icon;

  return (
    <div
      data-feed-island
      aria-hidden={!visible}
      className={`lg:hidden fixed left-1/2 z-[60] transition-[opacity,transform] duration-300 ease-out ${visible ? 'opacity-100 -translate-x-1/2 translate-y-0 scale-100' : 'pointer-events-none opacity-0 -translate-x-1/2 -translate-y-3 scale-90'}`}
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
    >
      <div className="flex h-10 items-center gap-2 rounded-full pl-1.5 pr-2.5 text-white">
        <button onClick={onAvatarClick} tabIndex={visible ? 0 : -1} aria-label="Toggle menu" className="flex items-center justify-center">
          {avatar ?? <Menu className="w-6 h-6" />}
        </button>
        <button onClick={onLogoClick} tabIndex={visible ? 0 : -1} aria-label="dehub home" className="flex items-center">
          <img src={logoSrc} alt="dehub" className="h-5 w-auto" width={24} height={20} />
        </button>
        <span className="h-5 w-px bg-white/20" />
        <button
          onClick={revealNav}
          tabIndex={visible ? 0 : -1}
          aria-label={`Show feed tabs, now on ${tab.label}`}
          className="flex items-center gap-1.5 text-[13px] font-semibold"
        >
          <TabIcon className="w-4 h-4" />
          {tab.label}
          <ChevronDown className="w-3.5 h-3.5 text-zinc-300" />
        </button>
        {showBell && (
          <>
            <span className="h-5 w-px bg-white/20" />
            <button onClick={onBellClick} tabIndex={visible ? 0 : -1} aria-label="Notifications" className="relative flex items-center justify-center">
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-[3px] bg-red-500 text-white text-[9px] font-bold rounded-[5px] flex items-center justify-center leading-none">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
