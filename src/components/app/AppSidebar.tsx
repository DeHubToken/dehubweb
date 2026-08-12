import React, { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isHomePath } from '@/lib/home-path';
import { PenSquare, LogIn, LogOut, Search, X, CornerDownLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { NAV_ITEMS } from '@/constants/app.constants';
import { MobileHeader } from './navigation/MobileHeader';
import { DesktopSidebar } from './navigation/DesktopSidebar';
import { SidebarNavItem } from './navigation/SidebarNavItem';
import { filterNavItems, exploreSearchHref } from './navigation/nav-search';
import { useSearchHistory } from '@/hooks/use-search-history';
// Lazy: PostModal drags in usePostForm → minting/wallet contract code. A
// static import here would pull the wallet stack into the entry bundle
// (AppSidebar is eager via AppLayout) — scripts/check-entry-bundle.mjs
// fails the build if that happens.
const PostModal = React.lazy(() =>
  import('@/features/post/PostModal').then(m => ({ default: m.PostModal }))
);
import { useAuth } from '@/contexts/AuthContext';
import { openStageModal } from '@/contexts/StageContext';
import { ChainSelector, type ChainId } from './ChainSelector';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { useCommunityActivityUnreadCount } from '@/hooks/use-community-activity-unread';

interface AppSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, disconnect } = useAuth();

  const { t } = useTranslation();
  // Menu search. Unlike the desktop rail this field is always shown: the sheet
  // is opened deliberately and closed again straight away, so there is no
  // resting state to keep uncluttered.
  const [menuQuery, setMenuQuery] = useState('');
  const { addToHistory } = useSearchHistory();
  const visibleNavItems = useMemo(
    () => filterNavItems(NAV_ITEMS, menuQuery, t),
    [menuQuery, t],
  );
  // Reset whenever the sheet closes, so it never reopens mid-filter.
  useEffect(() => {
    if (!isOpen) setMenuQuery('');
  }, [isOpen]);

  const runFullSearch = useCallback(() => {
    const query = menuQuery.trim();
    if (!query) return;
    addToHistory(query);
    navigate(exploreSearchHref(query));
    setMenuQuery('');
    onToggle();
  }, [menuQuery, addToHistory, navigate, onToggle]);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  // Mount on first open, keep mounted afterwards (close animation).
  const [postModalMounted, setPostModalMounted] = useState(false);
  useEffect(() => {
    if (isPostModalOpen) setPostModalMounted(true);
  }, [isPostModalOpen]);
  const [selectedChainId, setSelectedChainId] = useState<ChainId>(() => {
    const stored = localStorage.getItem('preferred-chain-id');
    return stored ? (Number(stored) as ChainId) : (BASE_CHAIN_ID as ChainId);
  });
  const handleChainChange = useCallback((id: ChainId) => {
    setSelectedChainId(id);
    localStorage.setItem('preferred-chain-id', String(id));
  }, []);
  const { unreadCount: communityActivityUnread } = useCommunityActivityUnreadCount();

  const mobileNavContent = (
    <>
      {/* Log in Button - shown at top when not authenticated */}
      {!isAuthenticated && (
        <div className="mb-4 pb-4 px-1">
          <LiquidGlassBubble shimmer noBorder className="w-full box-border cursor-pointer border border-white/30 rounded-2xl" onClick={() => setIsPostModalOpen(true)}>
            <div className="flex items-center justify-center gap-2 font-semibold text-base text-white py-1.5">
              <LogIn className="w-5 h-5" />
              {t('sidebar.logIn')}
            </div>
          </LiquidGlassBubble>
        </div>
      )}

      {/* Menu search — filters the list below. Content search is one row away
          via the hand-off at the bottom, which runs whatever is typed on
          Explore rather than leaving the field as a dead end. */}
      <div className="relative mb-3 px-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={menuQuery}
          onChange={(e) => setMenuQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); runFullSearch(); }
            if (e.key === 'Escape') { e.preventDefault(); setMenuQuery(''); }
          }}
          placeholder={t('sidebar.searchMenu')}
          aria-label={t('sidebar.searchMenu')}
          className="w-full h-10 pl-10 pr-9 rounded-xl bg-white/5 border border-white/10 text-[15px] text-white placeholder:text-zinc-500 outline-none focus:border-white/30 transition-colors"
        />
        {menuQuery && (
          <button
            type="button"
            onClick={() => setMenuQuery('')}
            aria-label={t('sidebar.clearSearch')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="space-y-1">
        {visibleNavItems.map((item) => {
          const isActive =
            item.path === '/app'
              ? isHomePath(location.pathname)
              : !item.external && !item.action && location.pathname.startsWith(item.path);

          return (
            <SidebarNavItem
              key={item.label}
              item={item}
              isActive={isActive}
              isHome={item.path === '/app'}
              currentPath={location.pathname}
              onNavigate={onToggle}
              onClick={item.action === 'open-stages' ? () => { onToggle(); openStageModal(); } : undefined}
              variant="mobile"
              notificationCount={item.label === 'Communities' ? communityActivityUnread : undefined}
            />
          );
        })}
      </nav>

      {menuQuery && (
        <>
          {visibleNavItems.length === 0 && (
            <p className="px-3 py-3 text-sm text-zinc-500">{t('sidebar.noMenuMatches')}</p>
          )}
          <button
            type="button"
            onClick={runFullSearch}
            className="mt-2 flex w-full items-center gap-3 px-3 py-3 rounded-xl text-left text-sm text-zinc-400 border-t border-white/10 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Search className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="truncate">{t('sidebar.searchDehubFor', { query: menuQuery.trim() })}</span>
            <CornerDownLeft className="w-4 h-4 ml-auto flex-shrink-0 opacity-60" />
          </button>
        </>
      )}

      {/* Post Button - only shown when authenticated */}
      {isAuthenticated && (
        <div className="mt-4 pt-4 space-y-3 px-1">
          <LiquidGlassBubble shimmer noBorder className="w-full box-border cursor-pointer border border-white/30 rounded-2xl" onClick={() => setIsPostModalOpen(true)}>
            <div className="flex items-center justify-center gap-2 font-semibold text-base text-white py-1.5">
              <PenSquare className="w-5 h-5" />
              {t('sidebar.post')}
            </div>
          </LiquidGlassBubble>
          <div className="flex items-center justify-center gap-3">
            <ChainSelector
              selectedChainId={selectedChainId}
              onChainChange={handleChainChange}
              variant="icon"
            />
            <button
              onClick={() => { onToggle(); disconnect(); }}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors py-2"
            >
              <LogOut className="w-4 h-4" />
              {t('sidebar.logOut')}
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile Header with Drawer */}
      <MobileHeader isOpen={isOpen} onToggle={onToggle}>
        {mobileNavContent}
      </MobileHeader>

      {/* Desktop Sidebar */}
      <DesktopSidebar onPostClick={() => setIsPostModalOpen(true)} />

      {/* Post Modal */}
      {postModalMounted && (
        <Suspense fallback={null}>
          <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
