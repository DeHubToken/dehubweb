import { useEffect, useRef, useState } from 'react';
import { Bell, Check, ChevronDown, Menu, SlidersHorizontal } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { setFeedTabsOpen, toggleFeedTabs, useFeedTabsOpen } from '@/lib/feed-tabs-reveal';

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
 * System theme, phones: the home feed's only top chrome. There is no logo bar
 * or resting tab pill; this small glass capsule floats over the feed so media
 * runs to the top of the screen. Avatar and mark on the left, the tab you are
 * on in the middle (tap it for a dropdown of the feeds, same glass), the bell
 * on the right. Like the old bar it slides away as you scroll down and comes
 * back as you scroll up. Sideways swipes between tabs are the feed's own and pass under
 * it untouched.
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
  const tabsOpen = useFeedTabsOpen();
  const rootRef = useRef<HTMLDivElement>(null);
  // A tap anywhere outside the capsule closes its dropdown.
  useEffect(() => {
    if (!tabsOpen) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setFeedTabsOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [tabsOpen]);
  const tab = FEED_TABS.find((t) => t.value === tabValue) ?? FEED_TABS[0];
  const TabIcon = tab.icon;

  return (
    <div
      ref={rootRef}
      data-feed-island
      aria-hidden={!visible}
      className={`lg:hidden fixed left-1/2 z-[120] w-max transition-[opacity,transform] duration-300 ease-out ${visible ? 'opacity-100 -translate-x-1/2 translate-y-0 scale-100' : 'pointer-events-none opacity-0 -translate-x-1/2 -translate-y-3 scale-90'}`}
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
    >
      <div className="flex h-10 items-center gap-2.5 rounded-xl pl-1.5 pr-3 text-white">
        <button onClick={onAvatarClick} tabIndex={visible ? 0 : -1} aria-label="Toggle menu" className="flex shrink-0 items-center justify-center">
          {avatar ?? <Menu className="w-6 h-6" />}
        </button>
        <button onClick={onLogoClick} tabIndex={visible ? 0 : -1} aria-label="dehub home" className="flex shrink-0 items-center">
          <img src={logoSrc} alt="dehub" className="block h-6 w-7 max-w-none shrink-0 object-contain" width={192} height={164} />
        </button>
        <span className="h-5 w-px bg-white/20" />
        <button
          onClick={toggleFeedTabs}
          tabIndex={visible ? 0 : -1}
          aria-expanded={tabsOpen}
          aria-label={`Feed tabs, now on ${tab.label}`}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold"
        >
          <TabIcon className="w-4 h-4" />
          {tab.label}
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-300 transition-transform ${tabsOpen ? 'rotate-180' : ''}`} />
        </button>
        {showBell && (
          <>
            <span className="h-5 w-px bg-white/20" />
            <button onClick={onBellClick} tabIndex={visible ? 0 : -1} aria-label="Notifications" className="relative flex shrink-0 items-center justify-center">
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
      {tabsOpen && visible && (
        <div data-feed-island-menu role="menu" className="absolute left-1/2 top-full mt-2 w-48 -translate-x-1/2 rounded-xl p-1.5 text-white">
          {FEED_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="menuitem"
              onClick={() => {
                setFeedTabsOpen(false);
                window.dispatchEvent(new CustomEvent('feed-island-select', { detail: value }));
              }}
              className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold ${value === tabValue ? 'bg-white/15' : 'hover:bg-white/10'}`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{label}</span>
              {value === tabValue && <Check className="w-4 h-4 text-white/80" />}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-white/15" />
          <button
            role="menuitem"
            onClick={() => {
              setFeedTabsOpen(false);
              window.dispatchEvent(new CustomEvent('home-tab-reclick', { detail: tabValue }));
            }}
            className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold text-zinc-200 hover:bg-white/10"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
        </div>
      )}
    </div>
  );
}
