import { useFeedRefresh } from '@/lib/feed-refresh';
import { ElectricLogo } from './ElectricLogo';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, Check, Menu, SlidersHorizontal, LayoutGrid, Plus } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { setFeedTabsOpen, toggleFeedTabs, useFeedTabsOpen } from '@/lib/feed-tabs-reveal';

import { setFeedIslandPortal } from '@/lib/feed-island-portal';

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
  unread: number;
  onBellClick: () => void;
  onCreatePost: () => void;
}

/** Fixed phone navigation capsule with separate sheets behind it. */
export function FeedIslandCapsule({
  visible,
  avatar,
  onAvatarClick,
  logoSrc,
  unread,
  onBellClick,
  onCreatePost,
}: FeedIslandCapsuleProps) {
  const refresh = useFeedRefresh();
  const show = visible || refresh.refreshing || refresh.progress > 0;
  const [tabValue, setTabValue] = useState(readActiveTab);
  useEffect(() => {
    const sync = () => setTabValue(readActiveTab());
    window.addEventListener('home-tab-changed', sync);
    return () => window.removeEventListener('home-tab-changed', sync);
  }, []);
  const tabsOpen = useFeedTabsOpen();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!tabsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFeedTabsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [tabsOpen]);
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

  return (
    <div
      ref={rootRef}
      data-feed-island
      aria-hidden={!show}
      className={`lg:hidden fixed left-1/2 z-[120] w-max h-11 isolate overflow-visible rounded-[15px] transition-[opacity,transform] duration-300 ease-out ${show ? 'opacity-100 -translate-x-1/2 translate-y-0 scale-100' : 'pointer-events-none opacity-0 -translate-x-1/2 -translate-y-3 scale-90'}`}
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
    >
      {/* Centre crest: you (or a burger when signed out) left, the bell
          right, the mark dead centre. The mark opens the feed list under it.
          The pill hugs its contents and the two side columns share one
          width, so the mark sits in the true middle. */}
      <div data-feed-island-surface className="relative z-10 grid h-11 w-max grid-cols-[1fr_auto_1fr] items-center rounded-[15px] px-[10px] text-white">
        <div className="flex min-w-[28px] items-center justify-start">
          <button onClick={onAvatarClick} tabIndex={visible ? 0 : -1} aria-label="Toggle menu" className="flex shrink-0 items-center justify-center">
            {avatar ?? <Menu className="w-6 h-6" />}
          </button>
        </div>
        <button
          onClick={toggleFeedTabs}
          tabIndex={visible ? 0 : -1}
          aria-expanded={tabsOpen}
          aria-label={`Feeds, now on ${tab.label}`}
          className="flex shrink-0 items-center justify-center px-5"
        >
          <span className="relative inline-flex" data-feed-refresh-logo aria-busy={refresh.refreshing}>
            <ElectricLogo active={show}><img src={logoSrc} alt="dehub" className="block h-[27.3px] w-[31.5px] max-w-none object-contain" width={192} height={164} /></ElectricLogo>
            {(refresh.refreshing || refresh.progress > 0) && (
              <svg data-feed-refresh-ring aria-hidden="true" width="36" height="36" viewBox="0 0 36 36" className="absolute left-1/2 top-1/2 pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
                <g className={refresh.refreshing ? 'animate-spin motion-reduce:animate-none' : undefined} style={{ transformOrigin: '18px 18px' }}>
                  <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="100.531" strokeDashoffset={100.531 * (1 - (refresh.refreshing ? 0.72 : refresh.progress))} transform="rotate(-90 18 18)" />
                </g>
              </svg>
            )}
          </span>
        </button>
        <div className="flex min-w-[28px] items-center justify-end">
          <button onClick={onBellClick} tabIndex={visible ? 0 : -1} aria-label="Notifications" className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            <Bell className="w-[21px] h-[21px]" strokeWidth={1.9} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-1.5 min-w-[16px] h-[16px] px-[3px] bg-red-500 text-white text-[9px] font-bold rounded-[6px] flex items-center justify-center leading-none">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="absolute inset-x-0 top-0 z-0 overflow-visible pointer-events-none">
      <div ref={setFeedIslandPortal} className="w-full pointer-events-auto" hidden={tabsOpen} />
      <AnimatePresence>
      {tabsOpen && visible && (
        <motion.div
          key="feed-drawer"
          data-feed-island-menu
          role="menu"
          initial={{ height: 0, opacity: 0, y: -8 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -8, pointerEvents: 'none' }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          data-feed-island-surface
          className="w-full overflow-hidden rounded-[15px] pt-11 text-white pointer-events-auto"
        >
        <div className="p-1.5">
          {FEED_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="menuitem"
              onClick={() => {
                setFeedTabsOpen(false);
                window.dispatchEvent(new CustomEvent('home-feed-select', { detail: value }));
              }}
              className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-semibold ${value === tabValue ? 'bg-white/15' : 'hover:bg-white/10'}`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{label}</span>
              {value === tabValue && <Check className="w-4 h-4 text-white/80" />}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-white/15" />
          <div className="flex items-center">
            <button role="menuitem" aria-label="Filters" title="Filters"
              onClick={() => { setFeedTabsOpen(false); window.dispatchEvent(new CustomEvent('home-tab-reclick', { detail: tabValue })); }}
              className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-white/10">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button role="menuitem" aria-label="Open menu" title="Menu"
              onClick={() => { setFeedTabsOpen(false); onAvatarClick(); }}
              className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-white/10">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button role="menuitem" aria-label="Create post" title="Create post"
              onClick={() => { setFeedTabsOpen(false); onCreatePost(); }}
              className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-white/10">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
      </div>
    </div>
  );
}
