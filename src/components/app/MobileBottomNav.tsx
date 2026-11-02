import FileText from "@/components/ui/cut-icons/blog";
import { getFeedSearchState, parkFeedSearch } from '@/lib/feed-search';
import Film from "@/components/ui/cut-icons/editor";
import Wand2 from "@/components/ui/cut-icons/prompt";
import Zap from "@/components/ui/cut-icons/superpowers";
import Scroll from "@/components/ui/cut-icons/glossary";
import { useTranslation as _useCopy } from 'react-i18next';
import React, { Suspense, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { StageNavChip } from './spaces/StageNavChip';
import { useStage } from '@/contexts/StageContext';
import { useScrollDirection } from '@/hooks/use-scroll-direction';
import { useKeyboardOpen } from '@/hooks/use-keyboard-open';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { isHomePath, isOnLiveFeed } from '@/lib/home-path';
import { isHomeFeedRoute } from '@/lib/home-routes';
import { disarmHomeNavIntent, resolveHomeNavIntent } from '@/lib/home-nav-intent';
import { scrollDocumentToSmooth } from '@/lib/document-scroll';
import { Loader2 } from "lucide-react";
import Trophy from "@/components/ui/cut-icons/leaderboard";
import LayoutDashboard from "@/components/ui/cut-icons/command";
import AssistantNavIcon from '@/components/ui/AssistantNavIcon';
import Wallet from "@/components/ui/cut-icons/wallet";
import BookOpen from "@/components/ui/cut-icons/docs";
import Lightbulb from "@/components/ui/cut-icons/feature-requests";
import Briefcase from "@/components/ui/cut-icons/bounties";
import Users from "@/components/ui/cut-icons/communities";
import CalendarDays from "@/components/ui/cut-icons/events";
import Vault from "@/components/ui/cut-icons/staking";
import ShieldCheck from "@/components/ui/cut-icons/security";
import Landmark from "@/components/ui/cut-icons/dao";
import Map from "@/components/ui/cut-icons/guide";
import BarChart3 from "@/components/ui/cut-icons/stats";
import Gamepad2 from "@/components/ui/cut-icons/arcade";

import Home from "@/components/ui/cut-icons/home";
import MessageSquare from "@/components/ui/cut-icons/messages";
import MessageEnvelope from "@/components/ui/cut-icons/message-envelope";
import Plus from "@/components/ui/cut-icons/add";
import User from "@/components/ui/cut-icons/profile";
import Search from "@/components/ui/cut-icons/search";
import Bookmark from "@/components/ui/cut-icons/save";
import Settings from "@/components/ui/cut-icons/settings-cog";
import Creator from "@/components/ui/cut-icons/creator";
import Bell from "@/components/ui/cut-icons/alerts";
import Mic from "@/components/ui/cut-icons/mic";

import { cn } from '@/lib/utils';
import { preloadRoute } from '@/lib/route-preload';
import { warmPostComposer } from '@/lib/preload-post-composer';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
// Lazy: the composer pulls minting/wallet contract code — a static import
// here (eager via AppLayout) would land it in the entry bundle
// (scripts/check-entry-bundle.mjs fails the build if that happens).
const PostModal = React.lazy(() =>
  import('@/features/post/PostModal').then(m => ({ default: m.PostModal }))
);
import { AuthPrompt } from './AuthPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { openStageModal } from '@/contexts/StageContext';
import { useTotalUnreadCount } from '@/hooks/use-messages';
import { usePublicChatUnreadCount } from '@/hooks/use-public-chat-unread';
import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { useTranslation } from 'react-i18next';
import { isKidsModePath } from '@/constants/app.constants';
import { isKidsModeLocked } from '@/lib/kids-mode-lock';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { applyNavOrder } from '@/lib/nav-order';
import { useNavOrderEditor } from '@/hooks/use-nav-order';
import { useDragReorder } from '@/hooks/use-drag-reorder';

// Every link in this bar is an icon and nothing else, so without a name each
// one reads to a screen reader as "link" — 25 of them on the 2026-09-02
// Lighthouse run. The English `label` below is the lookup key for the
// existing nav strings, which is also what the desktop sidebar shows.
const NAV_LABEL_KEYS: Record<string, string> = {
  Home: 'nav.home',
  Explore: 'nav.explore',
  Messages: 'nav.messages',
  AI: 'nav.assistant',
  Editor: 'creator.editor',
  Creator: 'commandCentre.creator',
  Profile: 'nav.profile',
  Notifications: 'nav.notifications',
  Arcade: 'nav.arcade',
  Events: 'nav.events',
  // The feature's own title, so the nav says what the page it opens says.
  Stages: 'stages.title',
  Command: 'nav.commandCentre',
  Wallet: 'nav.wallet',
  Staking: 'nav.staking',
  SuperPowers: 'superpowers.title',
  Governance: 'nav.governance',
  DAO: 'nav.dao',
  Leaderboard: 'nav.leaderboard',
  Bookmarks: 'nav.bookmarks',
  Settings: 'nav.settings',
  Features: 'nav.featureRequests',
  Feedback: 'stats.feedback.title',
  Guide: 'nav.guide',
  Stats: 'nav.stats',
  Docs: 'nav.docs',
  Blog: 'nav.blog',
  Careers: 'nav.careers',
  Glossary: 'nav.glossary',
  Prompt: 'nav.prompt',
  Communities: 'nav.communities',
};

type MobileNavItem = {
  icon: React.ComponentType<{ className?: string }>;
  themedIcon?: ThemeIconKey;
  label: string;
  path: string;
  requiresAuth?: boolean;
};

const SCROLL_NAV_ITEMS = [
  { icon: Settings, label: 'Settings', path: '/app/settings' },
  { icon: Film, label: 'Editor', path: '/editor' },
  { icon: Creator, label: 'Creator', path: '/creator' },
  { icon: User, label: 'Profile', path: '/app/profile', requiresAuth: true },
  { icon: Bell, label: 'Notifications', path: '/app/notifications' },
  { icon: Gamepad2, label: 'Arcade', path: '/arcade' },
  { icon: CalendarDays, label: 'Events', path: '/app/events' },
  { icon: Mic, label: 'Stages', path: '/stages' },
  { icon: LayoutDashboard, label: 'Command', path: '/app/command-centre' },
  { icon: Wallet, label: 'Wallet', path: '/app/wallet' },
  { icon: Vault, label: 'Staking', path: '/app/stake' },
  { icon: Zap, label: 'SuperPowers', path: '/app/superpowers' },
  { icon: ShieldCheck, label: 'Governance', path: '/governance' },
  { icon: Landmark, label: 'DAO', path: '/dao' },
  { icon: Trophy, label: 'Leaderboard', path: '/app/leaderboard' },
  { icon: Bookmark, label: 'Bookmarks', path: '/app/bookmarks' },
  { icon: Lightbulb, label: 'Features', path: '/features' },
  { icon: MessageSquare, label: 'Feedback', path: '/feedback' },
  { icon: Map, label: 'Guide', path: '/guide' },
  { icon: BarChart3, label: 'Stats', path: '/stats' },
  { icon: BookOpen, label: 'Docs', path: '/docs' },
  { icon: FileText, label: 'Blog', path: '/docs/blog' },
  { icon: Briefcase, label: 'Careers', path: '/app/jobs' },
  { icon: Scroll, label: 'Glossary', path: '/app/glossary' },
  { icon: Wand2, label: 'Prompt', path: '/prompt' },
  { icon: Users, label: 'Communities', path: '/app/communities' },
] satisfies MobileNavItem[];

/**
 * The whole bar as one list, in its default order: Home, Messages, (Create),
 * AI, Explore on the first screen, then everything reached by scrolling. Hold
 * any icon and drag to rearrange (hooks/use-drag-reorder); Create stays put in
 * the middle of the first screen and the rest flow around it.
 */
const BAR_ITEMS: MobileNavItem[] = [
  { icon: Home, label: 'Home', path: '/app' },
  { icon: MessageEnvelope, label: 'Messages', path: '/app/messages' },
  { icon: AssistantNavIcon, label: 'AI', path: '/app/assistant' },
  { icon: Search, label: 'Explore', path: '/app/explore' },
  ...SCROLL_NAV_ITEMS,
];
const CREATE_ID = 'create';
const CREATE_SLOT = 2;
/** Saved under the destination's i18n key, which the app's bar shares. */
const barItemId = (item: MobileNavItem) => NAV_LABEL_KEYS[item.label] ?? item.label;
const DEFAULT_BAR_IDS = BAR_ITEMS.map(barItemId);

/**
 * Drop everything off the Kids Mode allowlist. Explore stays, as it always
 * has on this bar.
 */
function kidsBar(items: MobileNavItem[], locked: boolean): MobileNavItem[] {
  return locked ? items.filter(item => item.label === 'Explore' || isKidsModePath(item.path)) : items;
}

export function MobileBottomNav() {
  const { t: _copy } = _useCopy();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { currentSpace, isConnected, isModalOpen } = useStage();
  const hasStageChip = !!currentSpace && isConnected && !isModalOpen && !isKidsModeLocked();
  // Subscribed, not just read: `kidsNav` below calls `isKidsModeLocked()`
  // directly, and without a hook holding that value this bar would keep its
  // adult destinations until something else happened to re-render it.
  const kidsLocked = useKidsModeLock();
  const navLabel = (label: string) => t(NAV_LABEL_KEYS[label] ?? label, label);

  // The person's own order (account when signed in, this device otherwise).
  const { order: savedBarOrder, save: saveBarOrder } = useNavOrderEditor('bar', DEFAULT_BAR_IDS);
  const barItems = useMemo(
    () => applyNavOrder(kidsBar(BAR_ITEMS, kidsLocked), savedBarOrder, barItemId),
    [savedBarOrder, kidsLocked],
  );
  const barById = useMemo(() => new globalThis.Map(barItems.map(item => [barItemId(item), item])), [barItems]);
  const barIds = useMemo(() => barItems.map(barItemId), [barItems]);
  const onBarCommit = useCallback((next: string[]) => saveBarOrder(next), [saveBarOrder]);
  const { order: liveBarOrder, draggingId: barDraggingId, itemProps: barDragProps } = useDragReorder({
    ids: barIds,
    onCommit: onBarCommit,
    liftScale: 1.08,
    axis: 'x',
  });
  const barOrder = useMemo(() => {
    const out = [...liveBarOrder];
    out.splice(Math.min(CREATE_SLOT, out.length), 0, CREATE_ID);
    return out;
  }, [liveBarOrder]);

  const dmUnread = useTotalUnreadCount();
  const messagesUnread = dmUnread + usePublicChatUnreadCount();
  // Same badge sources as DesktopSidebar — keep the two navs in sync
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: customUnread } = useCustomUnreadCount();
  const totalNotifUnread = (unreadCount?.total ?? 0) + (customUnread ?? 0);
  const navVisible = useScrollDirection();
  // On-screen keyboard up → hide the nav entirely; typing surfaces (chat)
  // reclaim its space so the screen splits between messages and composer.
  const keyboardOpen = useKeyboardOpen();
  // An open conversation hides it too: its reply strip (orb + drafts) fills
  // the band the pill would float over, and the thread has its own way back.
  const chatOpen =
    location.pathname === '/app/messages' &&
    new URLSearchParams(location.search).get('chat') === '1';
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postLiveMode, setPostLiveMode] = useState<'video' | undefined>();
  // Mount on first open, keep mounted afterwards (close animation).
  const [postModalMounted, setPostModalMounted] = useState(false);
  useEffect(() => {
    if (isPostModalOpen) setPostModalMounted(true);
  }, [isPostModalOpen]);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [isHomeRefreshing, setIsHomeRefreshing] = useState(false);
  const homeRefreshTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // First-visit scroll hint: nudge right then back to show more options
  useEffect(() => {
    const HINT_KEY = 'dehub_nav_scroll_hint_seen';
    if (localStorage.getItem(HINT_KEY)) return;
    
    const timer = setTimeout(() => {
      const el = scrollRef.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      
      // Smooth scroll right
      el.scrollTo({ left: 120, behavior: 'smooth' });
      
      // Then scroll back after a pause
      setTimeout(() => {
        el.scrollTo({ left: 0, behavior: 'smooth' });
        localStorage.setItem(HINT_KEY, 'true');
      }, 600);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);


  const handleNavClick = (e: React.MouseEvent, path: string) => {
    // On another feed (Videos, Shorts, Music...) Home goes back to the Home feed.
    if (path === '/app' && isHomeFeedRoute(location.pathname) && getFeedSearchState().open) {
      // A feed search is up: Home puts it away (words kept for the next open)
      // and shows the Home feed, rather than searching Home or refreshing.
      e.preventDefault();
      parkFeedSearch();
      let tab = 'home';
      try { tab = JSON.parse(sessionStorage.getItem('home-feed-state') || '{}')?.tab || 'home'; } catch { /* ignore */ }
      // Selecting the tab already lit would open its search again.
      if (tab !== 'home') window.dispatchEvent(new CustomEvent('home-feed-select', { detail: 'home' }));
      scrollDocumentToSmooth();
      return;
    }
    if (path === '/app' && isHomeFeedRoute(location.pathname)) {
      let tab = 'home';
      try { tab = JSON.parse(sessionStorage.getItem('home-feed-state') || '{}')?.tab || 'home'; } catch { /* ignore */ }
      if (tab !== 'home' || !isHomePath(location.pathname)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('home-feed-select', { detail: 'home' }));
        scrollDocumentToSmooth();
        return;
      }
    }
    if (path === '/app' && isHomePath(location.pathname)) {
      e.preventDefault();
      // First click on Home while already on Home just returns to the top —
      // refetching the feed on that click is what made this button feel slow
      // next to the feed tab strip. A second click refreshes.
      if (resolveHomeNavIntent(true) !== 'refresh') {
        scrollDocumentToSmooth();
        return;
      }
      window.dispatchEvent(new CustomEvent('home-refresh'));
      setIsHomeRefreshing(true);
      if (homeRefreshTimerRef.current) window.clearTimeout(homeRefreshTimerRef.current);
      homeRefreshTimerRef.current = window.setTimeout(() => setIsHomeRefreshing(false), 900);
      navigate('/app');
    }
  };

  // Leaving home disarms the second click, so arriving back on the feed never
  // lands on a click that refetches.
  const onHome = isHomePath(location.pathname);
  useEffect(() => {
    if (!onHome) disarmHomeNavIntent();
  }, [onHome]);

  useEffect(() => () => {
    if (homeRefreshTimerRef.current) window.clearTimeout(homeRefreshTimerRef.current);
  }, []);

  const handleProtectedNavClick = (e: React.MouseEvent, path: string, requiresAuth?: boolean) => {
    if (requiresAuth && !isAuthenticated) {
      e.preventDefault();
      setShowAuthPrompt(true);
      return;
    }
    handleNavClick(e, path);
  };

  const handlePostClick = () => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }
    setPostLiveMode(isOnLiveFeed(location.pathname) ? 'video' : undefined);
    setIsPostModalOpen(true);
  };



  return (
    <>
      <div
        data-bottom-nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-2 transition-transform duration-300 ease-in-out"
        style={{ transform: navVisible && !keyboardOpen && !chatOpen ? 'translateY(0)' : 'translateY(110%)', willChange: 'transform' }}
      >
        <nav
          className={cn("relative bg-zinc-900/10 backdrop-blur-2xl border border-white/10 rounded-2xl mx-auto max-w-[72%] md:max-w-md shadow-xl", hasStageChip && "flex items-center")}
          style={hasStageChip ? { maxWidth: 'min(calc(72% + 44px), 492px)' } : undefined}
        >
          {/* Nav items container */}
          <div 
            ref={scrollRef}
            className="flex min-w-0 flex-1 items-center h-12 md:h-14 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollSnapType: 'x proximity' }}
          >
            {barOrder.map((id) => {
              if (id === CREATE_ID) {
                return (
                  /* Center Create Button - liquid glass bubble. Pinned to the
                     middle of the first screen; everything around it moves. */
                  <button
                    key={CREATE_ID}
                    onClick={handlePostClick}
                    onPointerDown={() => { if (isAuthenticated) warmPostComposer(); }}
                    onPointerEnter={() => { if (isAuthenticated) warmPostComposer(); }}
                    onFocus={() => { if (isAuthenticated) warmPostComposer(); }}
                    aria-label={_copy("copy.bcf1bfcaa2af", { defaultValue: "Create post" })}
                    className="relative z-10 flex-shrink-0 w-1/5 h-12 md:h-14 flex items-center justify-center text-white"
                  >
                      <div data-nav-create className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center relative transition-transform duration-300 active:scale-95">
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 rounded-xl border border-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_8px_rgba(0,0,0,0.3)]"
                          style={{
                            // The bar behind it is already the blur; a second one
                            // inside it doubles Safari's work for no visible change.
                            backgroundColor: 'rgba(255,255,255,0.18)',
                          }}
                        />
                        <Plus
                          className="w-7 h-7 md:w-8 md:h-8 relative"
                          style={{ color: '#ffffff', zIndex: 10 }}
                        />
                      </div>
                  </button>
                );
              }
              const item = barById.get(id);
              if (!item) return null;
              const drag = barDragProps(id);
              const isActive = item.path === '/app'
                ? isHomePath(location.pathname)
                : location.pathname.startsWith(item.path);
              const badge = item.label === 'Messages'
                ? messagesUnread
                : item.label === 'Notifications'
                  ? totalNotifUnread
                  : 0;
              const glyphClass = cn(
                'w-5 h-5 md:w-6 md:h-6 transition-[filter] duration-200',
                isActive
                  ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                  : 'hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]'
              );
              return (
                <NavLink
                  key={id}
                  {...drag}
                  to={item.path}
                  onClick={(e) => handleProtectedNavClick(e, item.path, item.requiresAuth)}
                  onTouchStart={() => preloadRoute(item.path)}
                  onPointerEnter={() => preloadRoute(item.path)}
                  aria-label={item.label === 'Explore' ? t('nav.explore') : navLabel(item.label)}
                  className={cn(
                    'relative flex items-center justify-center h-12 md:h-14 flex-shrink-0 rounded-xl transition-colors duration-200 text-white',
                    // The lifted fill sits inside the slot with the bar's own inset,
                    // so the bar's edge never cuts it off.
                    "before:pointer-events-none before:absolute before:inset-x-1.5 before:inset-y-1 before:rounded-[14px] before:bg-transparent before:transition-[background-color,box-shadow] before:duration-[250ms] before:ease-[cubic-bezier(0.22,1,0.36,1)] before:content-['']",
                    barDraggingId === id && 'before:bg-white/15 before:shadow-[0_6px_16px_rgba(0,0,0,0.35)]'
                  )}
                  style={{ ...drag.style, width: '20%' }}
                >
                  <div className="relative w-5 h-5 md:w-6 md:h-6">
                    {item.label === 'Home' && isHomeRefreshing ? (
                      <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
                    ) : item.themedIcon ? (
                      <ThemedIcon icon={item.themedIcon} alt="" className={cn(glyphClass, 'object-contain')} />
                    ) : (
                      <item.icon
                        data-home-nav-glyph={item.label === 'Home' || undefined}
                        data-messages-nav-glyph={item.label === 'Messages' || undefined}
                        className={glyphClass}
                      />
                    )}
                    {badge > 0 && (
                      <span data-unread-chip className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-[3px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none whitespace-nowrap">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                </NavLink>
              );
            })}
          </div>
          {hasStageChip && <StageNavChip />}
        </nav>
      </div>

      {postModalMounted && (
        <Suspense fallback={null}>
          <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} initialLiveMode={postLiveMode} />
        </Suspense>
      )}
      <AuthPrompt isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
    </>
  );
}
