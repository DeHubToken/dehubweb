import { useTranslation as _useCopy } from 'react-i18next';
import { useFeedRefresh } from '@/lib/feed-refresh';
import { ElectricLogo } from './ElectricLogo';
import { FeedRefreshLogo } from './FeedRefreshLogo';
import { FeedPillPullEffect } from './FeedPillPullEffect';
import { feedDrawerClosed, feedDrawerOpen, feedDrawerExit, feedDrawerTransition } from './feed-drawer-motion';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Check from "@/components/ui/cut-icons/check";
import LayoutGrid from "@/components/ui/cut-icons/apps";

import { NotificationBell } from './NotificationBell';
import Menu from "@/components/ui/cut-icons/menu";
import SlidersHorizontal from "@/components/ui/cut-icons/settings";
import Plus from "@/components/ui/cut-icons/add";

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
  isAuthenticated: boolean;
  onLogoPointerDown: () => void;
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
  isAuthenticated,
  onLogoPointerDown,
  visible,
  avatar,
  onAvatarClick,
  logoSrc,
  unread,
  onBellClick,
  onCreatePost,
}: FeedIslandCapsuleProps) {
  const { t: _copy } = _useCopy();
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
      className={`lg:hidden fixed left-1/2 z-[120] w-max h-11 isolate overflow-visible rounded-2xl transition-[opacity,transform] duration-300 ease-out ${show ? 'opacity-100 -translate-x-1/2 translate-y-0 scale-100' : 'pointer-events-none opacity-0 -translate-x-1/2 -translate-y-3 scale-90'}`}
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
    >
      {/* Centre crest: avatar left, bell right, mark dead centre. Guests
          open the login drawer from the mark; members open the feed list.
          The pill hugs its contents and the two side columns share one
          width, so the mark sits in the true middle. */}
      <div data-feed-island-surface className="relative z-10 grid h-11 w-max grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-white/10 px-[10px] text-white">
        <div className="flex min-w-[28px] items-center justify-start">
          {isAuthenticated && <button onClick={onAvatarClick} tabIndex={visible ? 0 : -1} aria-label={_copy("copy.c02651240c87", { defaultValue: "Toggle menu" })} className="flex shrink-0 items-center justify-center">
            {avatar ?? <Menu className="w-6 h-6" />}
          </button>}
        </div>
        <button
          onClick={isAuthenticated ? toggleFeedTabs : onAvatarClick}
          onPointerDown={onLogoPointerDown}
          tabIndex={visible ? 0 : -1}
          aria-expanded={isAuthenticated ? tabsOpen : undefined}
          aria-label={isAuthenticated ? _copy("copy.7b9a17ee7709", { defaultValue: "Feeds, now on {{value1}}", value1: tab.label }) : _copy("copy.c189840cf7e2", { defaultValue: "Log in" })}
          className="flex h-11 w-[71.5px] shrink-0 items-center justify-center"
        >
          <span className="inline-flex">
            <FeedRefreshLogo>
              <ElectricLogo active={show}><img src={logoSrc} alt="dehub" className="block h-9 w-[42px] max-w-none object-contain" width={192} height={164} /></ElectricLogo>
            </FeedRefreshLogo>
          </span>
        </button>
        <div className="flex min-w-[28px] items-center justify-end">
          <button onClick={onBellClick} tabIndex={visible ? 0 : -1} aria-label={`${_copy("copy.788011833a5a", { defaultValue: "Notifications" })}${unread > 0 ? ` (${unread})` : ''}`} className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            <NotificationBell unread={unread} active={visible && !tabsOpen} />
          </button>
        </div>
      </div>
      {!tabsOpen && <FeedPillPullEffect distance={refresh.distance ?? 0} pulling={refresh.pulling ?? false} refreshing={refresh.refreshing} />}
      <div className="absolute inset-x-0 top-0 z-0 overflow-visible pointer-events-none">
      <div ref={setFeedIslandPortal} className="w-full pointer-events-auto" hidden={tabsOpen} />
      <AnimatePresence>
      {tabsOpen && visible && (
        <motion.div
          key="feed-drawer"
          data-feed-island-menu
          role="menu"
          initial={feedDrawerClosed}
          animate={feedDrawerOpen}
          exit={feedDrawerExit}
          transition={feedDrawerTransition(reduceMotion)}
          data-feed-island-surface
          className="w-full overflow-hidden rounded-2xl pt-11 text-white pointer-events-auto"
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
            <button role="menuitem" aria-label={_copy("copy.546ebb8eb993", { defaultValue: "Filters" })} title={_copy("copy.546ebb8eb993", { defaultValue: "Filters" })}
              onClick={() => { setFeedTabsOpen(false); window.dispatchEvent(new CustomEvent('home-tab-reclick', { detail: tabValue })); }}
              className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-white/10">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button role="menuitem" aria-label={_copy("copy.b40b3713b43d", { defaultValue: "Open menu" })} title={_copy("copy.99af6606ff9d", { defaultValue: "Menu" })}
              onClick={() => { setFeedTabsOpen(false); onAvatarClick(); }}
              className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-white/10">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button role="menuitem" aria-label={_copy("copy.bcf1bfcaa2af", { defaultValue: "Create post" })} title={_copy("copy.bcf1bfcaa2af", { defaultValue: "Create post" })}
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
