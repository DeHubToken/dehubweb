import { useTranslation as _useCopy } from 'react-i18next';
import { useRouteContentReady } from '@/hooks/use-route-content-ready';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { tokenLabel } from '@/lib/token-label';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { getAiScrapingPreference } from '@/lib/ai-scraping';
import { profileFeedUrl } from '@/lib/profile-feed-url';
import { useTranslation } from 'react-i18next';

import { Loader2 } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { LoginModal } from '@/components/app/LoginModal';
import { AuthGate } from '@/components/app/AuthGate';
import { FullscreenImageViewerLazy } from '@/components/app/cards/FullscreenImageViewerLazy';
import { CreatePlanModal, EditPlanModal } from '@/components/app/subscriptions';
import { TipModal } from '@/components/app/modals/TipModal';
import { FollowersListDrawer } from '@/components/app/profile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import dehubCoin from '@/assets/dehub-coin.png';

import { useProfilePage } from '@/hooks/use-profile-page';
import { useProfileFollow } from '@/hooks/use-profile-follow';
import { useUserPins } from '@/hooks/use-pins';
import { Pin } from 'lucide-react';
import { PostCard } from '@/components/app/cards/PostCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { formatTimeAgo, formatViews } from '@/lib/feed-utils';
import { resolveViewCount } from '@/lib/engagement';
import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildFeedImageUrls, buildVideoUrl, buildHlsUrl } from '@/lib/media-url';
import { ProfileHeader } from '@/components/app/profile/ProfileHeader';
import { ProfileTabContent } from '@/components/app/profile/ProfileTabContent';
import { ProfileContentToolbar } from '@/components/app/profile/ProfileContentToolbar';
import { ProfileSkeleton } from '@/components/app/profile/ProfileSkeleton';
import { ProfileOptionsContent } from '@/components/app/profile/ProfileOptionsDrawer';
import { getDefaultBanner, parseDefaultProfileTab, isProfileTabValue, type TabValue } from '@/components/app/profile/ProfileConstants';
import { useScrollFadeMask } from '@/components/app/feeds/useScrollFadeMask';
import type { SubscriptionPlan } from '@/lib/api/dehub';
import { useCreateUsernameOffer } from '@/hooks/use-username-offers';
import { useUsernameMarketConfig } from '@/hooks/use-username-market';
import { useAppTheme } from '@/contexts/ThemeContext';
import { CollapsingProfileHeader } from '@/components/app/profile/CollapsingProfileHeader';
import { PageHeader } from '@/components/app/PageHeader';
import { GlobalFeedNav } from '@/components/app/GlobalFeedNav';
import { ProfileFollowButton } from '@/components/app/profile/ProfileFollowButton';
import { UserAvatar } from '@/components/app/UserAvatar';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { StreamerBadge } from '@/components/app/live/StreamerBadge';

/** Tabs served by the creator's own /api/feed content query. */
const CONTENT_BACKED_TABS: TabValue[] = ['home', 'posts', 'images', 'videos'];

/**
 * Wraps tab content and remembers the max height ever rendered.
 * When switching to a shorter tab, the container keeps its previous
 * height so the page never shrinks and the scroll position stays put.
 * The locked height is released after a brief delay so the container
 * can grow naturally if new content loads.
 */
/**
 * The profile tabs' selected mark: a short glowing line under the active tab
 * ("Beam"), in place of the glass box other tab rows use. It takes the tab's
 * own text colour, so every theme's ink (white on dark, near-black on light)
 * carries through without a per-theme rule.
 */
function ProfileTabBeam({ rect, enableTransition }: {
  rect: { x: number; y: number; width: number; height: number; ready: boolean };
  enableTransition: boolean;
}) {
  if (!rect.ready) return null;
  const width = Math.max(16, Math.round(rect.width * 0.4));
  return (
    <div
      aria-hidden
      data-profile-tab-beam
      className="pointer-events-none absolute left-0 top-0 z-20 text-white"
      style={{
        width,
        height: 3,
        borderRadius: 3,
        background: 'currentColor',
        boxShadow: '0 0 10px currentColor, 0 0 2px currentColor',
        transform: `translate(${rect.x + (rect.width - width) / 2}px, ${rect.y + rect.height - 4}px)`,
        transition: enableTransition
          ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          : 'none',
      }}
    />
  );
}

function StableHeightContainer({ activeTab, children }: { activeTab: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const maxHeight = useRef(0);
  const [minH, setMinH] = useState(0);

  // On every tab switch, lock to the tallest height we've seen
  useEffect(() => {
    if (ref.current) {
      const h = ref.current.scrollHeight;
      if (h > maxHeight.current) maxHeight.current = h;
      setMinH(maxHeight.current);
    }
    // After content settles, update to actual height (allows shrinking after data changes)
    const timer = setTimeout(() => {
      if (ref.current) {
        maxHeight.current = ref.current.scrollHeight;
        setMinH(ref.current.scrollHeight);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab]);

  return (
    <div ref={ref} data-feed-root style={{ minHeight: minH > 0 ? `${minH}px` : undefined }}>
      {children}
    </div>
  );
}

function PinnedPostItem({ pin }: { pin: any }) {
  const { t: _copy } = _useCopy();
  // API returns post fields flat on the pin item itself (not nested in pin.post)
  const post: any = pin.post || pin;
  if (!post?.tokenId) return null;

  const postType = post.postType || (post.videoUrl ? 'video' : post.imageUrls?.length ? 'image' : 'post');
  const creatorObj = post.creator || post.owner;
  const rawAvatarPath = extractAvatarPath(post) || extractAvatarPath(creatorObj);
  const resolvedAddress = post.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  const rawTimestamp = post.createdAt || post.created_at;

  return (
    <div data-page-bento className="rounded-xl bg-zinc-900 border border-white/[0.08] overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <Pin className="w-3.5 h-3.5 text-zinc-400 fill-current" />
        <span className="text-xs text-zinc-400 font-medium">{_copy("copy.79175cb0f6da", { defaultValue: "Pinned post" })}</span>
      </div>
      {(postType === 'video' || postType === 'audio' || postType === 'feed-audio') ? (
        <VideoCard video={{
          id: String(post.tokenId), type: 'video',
          thumbnail: buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg',
          videoUrl: buildVideoUrl(post.tokenId),
          hlsUrl: buildHlsUrl(post.hlsUrl),
          title: post.title || post.name || '',
          channel: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
          channelAvatar: avatar, verified: false,
          views: formatViews(resolveViewCount(post)).replace(' views', ''),
          uploadedAgo: formatTimeAgo(rawTimestamp),
          duration: '', durationSeconds: 0,
          likeCount: post.totalVotes?.for || 0, dislikeCount: post.totalVotes?.against || 0,
          commentCount: post.commentCount || 0, repostCount: (post.totalReposts || 0) + (post.quotes || 0),
          isOwner: false, isUnlocked: false,
          creatorId: resolvedAddress,
          creatorUsername: post.minterUsername || creatorObj?.username,
          creatorBadgeBalance: post.minterUser?.hideBadgeAndBalance ? 0 : post.minterUser?.badgeBalance,
          creatorPaymentsDisabled: post.minterUser?.hideBadgeAndBalance === true,
        }} />
      ) : postType === 'image' || postType === 'feed-images' ? (
        <ImageCard post={{
          id: String(post.tokenId), type: 'image',
          username: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
          verified: false, avatar,
          image: buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg',
          imageUrls: buildFeedImageUrls(post.imageUrls) || [buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg'],
          caption: post.description || '', likes: post.totalVotes?.for || 0,
          dislikes: post.totalVotes?.against || 0,
          comments: post.commentCount || 0, views: formatViews(resolveViewCount(post)).replace(' views', ''),
          timeAgo: formatTimeAgo(rawTimestamp),
          creatorId: resolvedAddress,
          creatorUsername: post.minterUsername || creatorObj?.username,
          creatorBadgeBalance: post.minterUser?.hideBadgeAndBalance ? 0 : post.minterUser?.badgeBalance,
          creatorPaymentsDisabled: post.minterUser?.hideBadgeAndBalance === true,
          isOwner: false, isUnlocked: false,
          repostCount: (post.totalReposts || 0) + (post.quotes || 0),
        }} />
      ) : (
        <PostCard post={{
          id: String(post.tokenId), type: 'post',
          createdAt: rawTimestamp || '',
          views: formatViews(resolveViewCount(post)).replace(' views', ''),
          author: {
            id: resolvedAddress,
            name: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
            handle: post.minterUsername || creatorObj?.username || resolvedAddress?.slice(0, 8) || 'anon',
            avatarSeed: avatar, verified: false,
            badgeBalance: post.minterUser?.hideBadgeAndBalance ? 0 : post.minterUser?.badgeBalance,
            paymentsDisabled: post.minterUser?.hideBadgeAndBalance === true,
          },
          content: post.description || post.name || '',
          stats: {
            comments: post.commentCount || 0,
            reposts: (post.totalReposts || 0) + (post.quotes || 0),
            likes: post.totalVotes?.for || 0,
            dislikes: post.totalVotes?.against || 0,
          },
        }} />
      )}
    </div>
  );
}

function PinnedPostSection({ profileAddress }: { profileAddress: string }) {
  const { data } = useUserPins(profileAddress);
  const pins = data?.items || [];
  if (pins.length === 0) return null;

  return (
    <div className="space-y-2">
      {pins.map((pin) => (
        <PinnedPostItem key={pin.pinId} pin={pin} />
      ))}
    </div>
  );
}

export default function ProfilePage() {
  useRouteContentReady();
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  // UI-only state managed in orchestrator
  const [activeTab, setActiveTab] = useState<TabValue>('home');
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false);
  const [offerDrawerOpen, setOfferDrawerOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useSurfaceDraft("pages/app/ProfilePage.tsx:offerAmount", '');
  const [offerMessage, setOfferMessage] = useSurfaceDraft("pages/app/ProfilePage.tsx:offerMessage", '');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [followListDrawerOpen, setFollowListDrawerOpen] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const createOffer = useCreateUsernameOffer();
  const { data: usernameMarketConfig } = useUsernameMarketConfig();
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  

  // All data fetching + derived state. activeTab goes in because the filter
  // panel's post-type row only applies on the All tab.
  const data = useProfilePage({ activeTab });

  // Land on the tab the profile owner chose to show first. Applied once per
  // profile (keyed by wallet address) so a visitor's own tab clicks afterwards
  // aren't clobbered, and navigating to a different profile re-applies theirs.
  const appliedDefaultTabFor = useRef<string | null>(null);
  const profileKey = data.apiProfile?.walletAddress || null;
  useEffect(() => {
    if (!profileKey || appliedDefaultTabFor.current === profileKey) return;
    appliedDefaultTabFor.current = profileKey;
    // ?tab= wins over the saved default: it is only ever set by something that
    // sent the user here to do one specific thing (the composer's Subscribers
    // row pointing at plan creation), and landing them on Home instead makes
    // that link a dead end.
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab && isProfileTabValue(requestedTab)) {
      setActiveTab(requestedTab);
      return;
    }
    setActiveTab(parseDefaultProfileTab(
      (data.apiProfile?.customs as Record<string, unknown> | undefined)?.defaultProfileTab
    ));
  }, [profileKey, data.apiProfile?.customs]);


  // Swallow the tab content at the sticky tabs bento's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const profileHeaderRef = useRef<HTMLDivElement>(null);
  const profileTabsRef = useRef<HTMLDivElement>(null);
  const [showDesktopIdentity, setShowDesktopIdentity] = useState(false);
  useEffect(() => {
    const actions = profileHeaderRef.current?.querySelector('[data-profile-actions]');
    if (!actions) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowDesktopIdentity(entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 44)),
      { rootMargin: '-44px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(actions);
    return () => observer.disconnect();
  }, [!!data.profile, profileKey]);
  const [profileTabsHeight, setProfileTabsHeight] = useState(56);
  useEffect(() => {
    const tabs = profileTabsRef.current;
    if (!tabs) return;
    const measure = () => setProfileTabsHeight(tabs.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [!!data.profile]);
  const profileContentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(
    profileContentRef,
    '[data-profile-tabs] > [data-feed-nav]',
    [!!data.profile, data.isAuthenticated],
    { allThemes: true, edge: 'bottom' },
  );

  // At the top edge, the tabs become the single profile navigation row.
  const stuckSentinelRef = useRef<HTMLDivElement>(null);
  const [isTabsStuck, setIsTabsStuck] = useState(false);
  useEffect(() => {
    const el = stuckSentinelRef.current;
    if (!el) return;
    // The desktop tab row replaces the feed pill when it reaches the top.
    const desktop = window.matchMedia('(min-width: 1024px)');
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      const top = desktop.matches ? 44 : 4;
      observer = new IntersectionObserver(
        ([entry]) => setIsTabsStuck(entry.boundingClientRect.top <= (entry.rootBounds?.top ?? top)),
        { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(el);
    };
    observe();
    desktop.addEventListener('change', observe);
    return () => {
      desktop.removeEventListener('change', observe);
      observer?.disconnect();
    };
  }, [!!data.profile]);

  const { layerRef: tabsIndicatorLayerRef, setRef: setTabRef, rect: tabIndicator, onScroll: handleTabsScroll } = useTabIndicator(activeTab, isTabsStuck);
  const { ref: tabsFadeRef, style: tabsFadeStyle } = useScrollFadeMask<HTMLDivElement>();
  useEffect(() => {
    const button = profileTabButtonPositions.current[activeTab];
    const rail = tabsFadeRef.current;
    if (!button || !rail) return;
    const buttonRect = button.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    if (buttonRect.left < railRect.left) rail.scrollLeft += buttonRect.left - railRect.left;
    else if (buttonRect.right > railRect.right) rail.scrollLeft += buttonRect.right - railRect.right;
  }, [activeTab, isTabsStuck, tabsFadeRef]);
  const [tabTransition, setTabTransition] = useState(false);

  // Drag-to-swipe state for profile tab indicator
  const profileTabButtonPositions = useRef<Partial<Record<string, HTMLElement | null>>>({});
  const profileDragState = useRef<{ startX: number; startRectX: number; startWidth: number; currentX: number } | null>(null);
  const [isProfileDragging, setIsProfileDragging] = useState(false);
  const [profileDragOffsetX, setProfileDragOffsetX] = useState(0);

  const findNearestProfileTab = useCallback((indicatorCenterX: number) => {
    const layer = tabsIndicatorLayerRef.current;
    if (!layer) return activeTab;
    const layerRect = layer.getBoundingClientRect();
    let nearest: TabValue = activeTab;
    let minDist = Infinity;
    for (const [key, el] of Object.entries(profileTabButtonPositions.current)) {
      if (!el) continue;
      const br = el.getBoundingClientRect();
      const btnCenter = br.left - layerRect.left + br.width / 2;
      const dist = Math.abs(indicatorCenterX - btnCenter);
      if (dist < minDist) { minDist = dist; nearest = key as TabValue; }
    }
    return nearest;
  }, [activeTab, tabsIndicatorLayerRef]);

  const handleProfileDragStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    profileDragState.current = { startX: e.clientX, startRectX: tabIndicator.x, startWidth: tabIndicator.width, currentX: e.clientX };
    setIsProfileDragging(true);
    setProfileDragOffsetX(0);
  }, [tabIndicator.x, tabIndicator.width]);

  const handleProfileDragMove = useCallback((e: React.PointerEvent) => {
    if (!profileDragState.current) return;
    profileDragState.current.currentX = e.clientX;
    const dx = e.clientX - profileDragState.current.startX;
    setProfileDragOffsetX(dx);
    const currentCenterX = profileDragState.current.startRectX + dx + profileDragState.current.startWidth / 2;
    const nearest = findNearestProfileTab(currentCenterX);
    if (nearest !== activeTab) {
      setTabTransition(true);
      setActiveTab(nearest);
      setTimeout(() => setTabTransition(false), 450);
    }
  }, [activeTab, findNearestProfileTab]);

  const handleProfileDragEnd = useCallback(() => {
    if (!profileDragState.current) return;
    profileDragState.current = null;
    setIsProfileDragging(false);
    setProfileDragOffsetX(0);
    setTabTransition(true);
    setTimeout(() => setTabTransition(false), 450);
  }, []);

  const profileDragDisplayRect = isProfileDragging
    ? { ...tabIndicator, x: (profileDragState.current?.startRectX ?? tabIndicator.x) + profileDragOffsetX, ready: true }
    : tabIndicator;


  // Follow logic
  const { isFollowLoading, handleFollow, handleUnfollow } = useProfileFollow({
    profile: data.profile,
    isAuthenticated: data.isAuthenticated,
    isTargetPrivate: data.isTargetPrivate,
    setFollowStatus: data.setFollowStatus,
    handleApiError: data.handleApiError,
    setShareSheetOpen,
    setLoginModalOpen,
  });

  // Share options component (passed to ProfileHeader for the drawer)
  const ShareOptions = () => (
    <ProfileOptionsContent
      profile={data.profile!}
      isViewingOwnProfile={data.isViewingOwnProfile}
      isFollowing={data.isFollowing}
      handleUnfollow={handleUnfollow}
      setShareSheetOpen={setShareSheetOpen}
      onMakeOffer={handleMakeOffer}
      onTip={!data.isViewingOwnProfile && !data.profile.hideBadgeAndBalance ? () => setShowTipModal(true) : undefined}
      isBlocked={data.isBlocked}
      isBlockLoading={data.isBlockLoading}
      handleBlock={data.handleBlock}
    />
  );

  // Make Offer handler (from options drawer)
  const handleMakeOffer = () => {
    setShareSheetOpen(false);
    setOfferDrawerOpen(true);
  };

  // What the typed dollar figure is worth in tokens at the moment of typing.
  // Shown, never sent: the offer is denominated in dollars and converted again
  // at checkout, exactly as an asking price is.
  const offerDhb = (() => {
    const usd = Number(offerAmount);
    const peg = usernameMarketConfig?.dhbUsdPeg;
    if (!Number.isFinite(usd) || usd <= 0 || !peg) return null;
    return Math.ceil(usd / peg);
  })();

  const handleSubmitOffer = () => {
    const handle = (data.profile?.handle || '').replace(/^@/, '');
    const priceUsd = Number(offerAmount);
    if (!handle) {
      toast.error(t('profile.offerNeedsHandle'));
      return;
    }
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      toast.error(t('profile.validOfferAmount'));
      return;
    }
    // The drawer closes on success only. A refused offer — a price out of
    // bounds, an offer on a handle nobody holds — leaves the amount where the
    // reader typed it, next to the toast saying why.
    createOffer.mutate(
      { username: handle, priceUsd, message: offerMessage.trim() || undefined },
      {
        onSuccess: () => {
          setOfferDrawerOpen(false);
          setOfferAmount.complete(offerAmount, '');
          setOfferMessage.complete(offerMessage, '');
        },
      },
    );
  };

  // Loading state — show skeleton only if we don't have profile data yet.
  // Don't re-show skeleton when auth resolves (keepPreviousData handles the transition).
  // Also show skeleton if profile errored but auth is still loading or profile is refetching
  // (race condition: private profiles return empty shell before auth token is available).
  if (!data.profile && (data.isAuthLoading || data.isLoadingProfile || data.isFetchingProfile)) {
    return <div className="relative"><PageHeader overlay plainBack /><ProfileSkeleton /></div>;
  }

  // Auth gate for own profile
  if (data.isOwnProfile && !data.isAuthenticated) {
    return <div className="relative"><PageHeader overlay plainBack /><AuthGate description={t('profile.loginDescription')} /></div>;
  }

  // No profile found
  if (!data.profile) {
    const isUsernameRoute = !!data.routeUsername;
    const displayUsername = data.routeUsername || '';
    
    const notFoundContent = (
      <div className="relative min-h-screen flex flex-col items-center justify-center gap-6 p-4 text-center">
        <PageHeader overlay plainBack />
        {/* Any unknown top-level path lands here (/:username is the catch-all),
            so this is the SPA's real 404: without its own head it kept the
            home title, index,follow and a self canonical. */}
        <SEOHead title={`${t('notFound.title')} — DeHub`} description={t('profile.notFound')} noindex noCanonical />
        {isUsernameRoute && !data.isProfileError ? (
          <>
            <ThemedIcon icon="profile" alt="" className="w-20 h-20 object-contain" />
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">{t('profile.usernameAvailable')}</h2>
              <p className="text-zinc-400 max-w-md">
                {t('profile.signUpToClaim')} <span className="text-white font-medium">dehub.io/{displayUsername}</span>
              </p>
            </div>
            <Button
              onClick={() => setLoginModalOpen(true)}
              data-primary-cta
                    className="h-12 px-8 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
            >
              {t('profile.signUp')}
            </Button>
            <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />
          </>
        ) : (
          <>
            <ThemedIcon icon="profile" alt="" className="w-20 h-20 object-contain opacity-80" />
            <h2 className="text-xl font-bold text-white">{t('profile.notFound')}</h2>
            <p className="text-zinc-400 max-w-md">
              {data.isProfileError
                ? t('profile.unableToLoad')
                : t('profile.doesNotExist')}
            </p>
            {/* A load error (e.g. a transient API hiccup while flicking tabs)
                used to stick until a full page refresh — offer an in-place
                retry that refetches the profile instead. */}
            {data.isProfileError && (
              <Button
                onClick={() => data.refetchProfile?.()}
                disabled={data.isFetchingProfile}
                data-primary-cta
                    className="h-11 px-6 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
              >
                {data.isFetchingProfile ? t('common.loading') : t('common.tryAgain')}
              </Button>
            )}
          </>
        )}
      </div>
    );

    return notFoundContent;
  }

  const profileContent = (
    <div 
      ref={data.profileContainerRef}
      data-classic-feed-layout={theme === 'system' ? '' : undefined}
      className="min-h-screen"
      onTouchStart={data.pullHandlers.onTouchStart}
      onTouchMove={data.pullHandlers.onTouchMove}
      onTouchEnd={data.pullHandlers.onTouchEnd}
      onMouseDown={data.pullHandlers.onMouseDown}
      onMouseMove={data.pullHandlers.onMouseMove}
      onMouseUp={data.pullHandlers.onMouseUp}
      onMouseLeave={data.pullHandlers.onMouseLeave}
    >
      {/* Canonical uses the bare /handle form (no @) — the sitemap-profiles fn
          and the worker's bot HTML both use it, and an @-prefixed canonical
          split the signal between two URLs for every profile. */}
      <SEOHead
        title={(data.profile?.name || data.profile?.handle) ? _copy("copy.d63869b9dc77", { defaultValue: "{{value1}} on DeHub — posts, videos & profile", value1: data.profile?.name || data.profile?.handle }) : _copy("copy.31169fe03ec0", { defaultValue: "Profile on DeHub" })}
        description={data.profile?.bio || _copy("copy.11ef7a60f50a", { defaultValue: "View {{value1}} on DeHub", value1: data.profile?.name || data.profile?.handle || _copy("copy.f119e4acc42e", { defaultValue: "this profile" }) })}
        url={`https://dehub.io/${(data.profile?.handle || '').replace(/^@/, '')}`}
        aiScraping={data.profile ? getAiScrapingPreference(data.profile.customs) : undefined}
        feed={data.profile?.handle && !data.isTargetPrivate ? { url: profileFeedUrl(data.profile.handle) } : undefined}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: data.profile?.name || data.profile?.handle || 'DeHub User',
          url: `https://dehub.io/${(data.profile?.handle || '').replace(/^@/, '')}`,
          ...(data.profile?.bio && { description: data.profile.bio }),
          ...(data.profile?.avatarUrl && { image: data.profile.avatarUrl }),
          // Literal machine-readable field, never translated — a JSON-LD
          // consumer expects a stable token, not a sentence in the viewer's
          // locale.
          ...(data.profile && {
            usageInfo: getAiScrapingPreference(data.profile.customs) === 'allow' ? 'ai-training-allowed' : 'ai-training-prohibited',
          }),
        }}
      />
      <div className="hidden lg:sticky lg:top-0 lg:z-[80] lg:block" data-profile-desktop-feed-nav data-joined={isTabsStuck}>
        <GlobalFeedNav profilePage compactProfileContent={showDesktopIdentity ? <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <UserAvatar name={data.profile.name} handle={data.profile.handle} avatarUrl={data.profile.avatarUrl} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-sm font-bold leading-tight text-white">
                <span className="truncate">{data.profile.name}</span>
                <BadgeIcon src={data.badgeUrl} className="h-[1em] w-[1em] shrink-0" />
                <StreamerBadge address={data.profile.walletAddress} />
              </div>
              <p className="truncate text-[10px] leading-tight text-zinc-400">{data.profile.handle}</p>
            </div>
          </div>
          <div className="shrink-0 pr-1">
            <ProfileFollowButton profile={data.profile} apiProfile={data.apiProfile} isViewingOwnProfile={data.isViewingOwnProfile} isBlocked={data.isBlocked} isFetchingProfile={data.isFetchingProfile} isFollowing={data.isFollowing} isPending={data.isPending} isTargetPrivate={data.isTargetPrivate} isFollowLoading={isFollowLoading} handleFollow={handleFollow} handleUnfollow={handleUnfollow} />
          </div>
        </> : undefined} />
      </div>
      <CollapsingProfileHeader
        headerRef={profileHeaderRef}
        tabsPinned={isTabsStuck}
        tabsHeight={profileTabsHeight}
        name={data.profile.name}
        handle={data.profile.handle}
        coverUrl={data.profile.coverUrl || getDefaultBanner(data.profile.walletAddress)}
        followAction={<ProfileFollowButton profile={data.profile} apiProfile={data.apiProfile} isViewingOwnProfile={data.isViewingOwnProfile} isBlocked={data.isBlocked} isFetchingProfile={data.isFetchingProfile} isFollowing={data.isFollowing} isPending={data.isPending} isTargetPrivate={data.isTargetPrivate} isFollowLoading={isFollowLoading} handleFollow={handleFollow} handleUnfollow={handleUnfollow} />}
      />
      {/* Pull-to-refresh indicator */}
      {data.pullDistance > 0 && (
        <div 
          className="flex items-center justify-center transition-all duration-150"
          style={{ height: data.pullDistance, minHeight: data.pullDistance > 0 ? 20 : 0 }}
        >
          <div className="relative">
            <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <circle
                cx="16" cy="16" r="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 14}
                strokeDashoffset={2 * Math.PI * 14 * (1 - (data.isHoldingAtThreshold ? data.holdProgress : Math.min(data.pullDistance / data.PULL_THRESHOLD, 1)))}
                className="transition-all duration-75"
              />
            </svg>
            {data.isHoldingAtThreshold && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ opacity: data.holdProgress }} />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Refreshing indicator */}
      {data.isRefreshing && data.pullDistance === 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
      )}
      
      <div className={cn('p-2 sm:p-3 space-y-3', (theme === 'system' || theme === 'immersive') && 'max-sm:pt-0')}>
        {/* Profile Card Bento */}
        <div ref={profileHeaderRef} className="relative max-sm:-mx-2">
        <ProfileHeader
          profile={data.profile}
          apiProfile={data.apiProfile}
          isViewingOwnProfile={data.isViewingOwnProfile}
          isAuthenticated={data.isAuthenticated}
          badgeUrl={data.badgeUrl}
          badgeTier={data.badgeTier}
          isFollowing={data.isFollowing}
          isPending={data.isPending}
          isTargetPrivate={data.isTargetPrivate}
          isFollowLoading={isFollowLoading}
          handleFollow={handleFollow}
          handleUnfollow={handleUnfollow}
          isSubscribed={data.isSubscribed}
          hasPlans={data.hasPinnedPlans}
          setFullscreenImage={setFullscreenImage}
          setActiveTab={setActiveTab}
          shareSheetOpen={shareSheetOpen}
          setShareSheetOpen={setShareSheetOpen}
          setLoginModalOpen={setLoginModalOpen}
          ShareOptions={ShareOptions}
          showFollowersFollowing={data.showFollowersFollowing}
          hideFollowerCounts={data.hideFollowerCounts}
          setFollowListType={setFollowListType}
          setFollowListDrawerOpen={setFollowListDrawerOpen}
          translatedBio={data.translatedBio}
          setTranslatedBio={data.setTranslatedBio}
          isBlocked={data.isBlocked}
          isFetchingProfile={data.isFetchingProfile}
        />
        </div>

        {/* Back, profile identity, scrolling tabs and Follow share one pinned row. */}
        <div ref={stuckSentinelRef} aria-hidden className="h-0" />
        <div
          data-feed-nav-outer
          data-profile-tabs
          ref={profileTabsRef}
          data-joined={isTabsStuck}
          data-nav-hide="off"
          className="sticky z-50 -mx-2 sm:-mx-3 -mb-2 sm:-mb-3 px-2 sm:px-3 pt-1 pb-1"
        >
        <div data-page-bento data-feed-nav data-profile-single-row className={cn('bg-zinc-900 rounded-xl relative', isTabsStuck && 'flex items-center gap-1 p-1')} style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
          <div data-nav-glass-backdrop aria-hidden />
          {isTabsStuck && <>
            <div className="relative shrink-0 w-9 h-11">
              <PageHeader overlay plainBack className="!top-1 !left-0 !right-auto" />
            </div>
            {!data.isViewingOwnProfile && <div className="flex shrink-0 items-center gap-2 pr-1" title={`${data.profile.name} ${data.profile.handle}`}>
              <UserAvatar name={data.profile.name} handle={data.profile.handle} avatarUrl={data.profile.avatarUrl} size="sm" />
              <div className="hidden min-w-0 max-w-24 md:block">
                <div className="flex items-baseline gap-1 text-xs sm:text-sm font-bold leading-tight text-white">
                  <p className="min-w-0 truncate">{data.profile.name}</p>
                  <BadgeIcon src={data.badgeUrl} className="w-[1em] h-[1em]" />
                  <StreamerBadge address={data.profile.walletAddress} />
                </div>
                <p className="truncate text-[10px] sm:text-xs leading-tight text-zinc-400">{data.profile.handle}</p>
              </div>
            </div>}
          </>}
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl">
          <div ref={tabsIndicatorLayerRef} className="relative overflow-visible">
            <ProfileTabBeam rect={profileDragDisplayRect} enableTransition={!isProfileDragging && tabTransition} />
            {/* Drag handle overlay */}
            {profileDragDisplayRect.ready && (
              <div
                className="absolute z-30 cursor-grab active:cursor-grabbing"
                style={{
                  transform: `translate(${profileDragDisplayRect.x}px, ${profileDragDisplayRect.y}px)`,
                  width: profileDragDisplayRect.width,
                  height: profileDragDisplayRect.height,
                  transition: !isProfileDragging && tabTransition
                    ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                    : 'none',
                }}
                onPointerDown={handleProfileDragStart}
                onPointerMove={handleProfileDragMove}
                onPointerUp={handleProfileDragEnd}
                onPointerCancel={handleProfileDragEnd}
              />
            )}
            <div
              ref={tabsFadeRef}
              className="relative z-20 flex overflow-x-auto scrollbar-hide"
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch', ...tabsFadeStyle } as React.CSSProperties}
              onScroll={handleTabsScroll}
            >
              {data.PROFILE_TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    ref={(el) => {
                      setTabRef(tab.value)(el);
                      profileTabButtonPositions.current[tab.value] = el;
                    }}
                    onClick={() => setActiveTab(tab.value)}
                    aria-pressed={isActive}
                    title={t(`profile.tabs.${tab.value}`, tab.label)}
                    data-feed-tab-btn data-active={isActive}
                    className={cn(
                      'relative z-40 flex flex-col items-center justify-center gap-px px-2 rounded-xl transition-[color,opacity] duration-300 text-white',
                      !isActive && 'opacity-60 hover:opacity-90',
                      isTabsStuck ? 'shrink-0 w-14 h-11' : 'flex-1 min-w-[52px] py-[9px]',
                    )}
                  >
                    <tab.icon className="w-[18px] h-[18px] relative z-10" />
                    <span className="text-[10px] leading-tight font-medium relative z-10">{tab.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          </div>
          {isTabsStuck && <div className="profile-rail-follow shrink-0 max-w-[36%]">
            <ProfileFollowButton profile={data.profile} apiProfile={data.apiProfile} isViewingOwnProfile={data.isViewingOwnProfile} isBlocked={data.isBlocked} isFetchingProfile={data.isFetchingProfile} isFollowing={data.isFollowing} isPending={data.isPending} isTargetPrivate={data.isTargetPrivate} isFollowLoading={isFollowLoading} handleFollow={handleFollow} handleUnfollow={handleUnfollow} />
          </div>}
        </div>
        </div>

        {/* Tab Content - all panels rendered, inactive hidden via CSS */}
        <div ref={profileContentRef} data-profile-content>
        {/* Sort + search, on the four tabs actually backed by this creator's
            content. The other tabs (plans, live, fractions, pinned) come from
            their own endpoints and the toolbar would do nothing there. */}
        {CONTENT_BACKED_TABS.includes(activeTab) && (
          <ProfileContentToolbar
            sort={data.contentSort}
            onSortChange={data.setContentSort}
            search={data.contentSearch}
            onSearchChange={data.setContentSearch}
            filters={data.contentFilters}
            onFiltersChange={data.setContentFilters}
            onFiltersReset={data.resetContentFilters}
            filtersOpen={data.contentFiltersOpen}
            onFiltersOpenChange={data.setContentFiltersOpen}
            showPostType={data.showPostTypeFilter}
            resultCount={
              activeTab === 'posts' ? data.PROFILE_POSTS.length
                : activeTab === 'images' ? data.PROFILE_IMAGES.length
                : activeTab === 'videos' ? data.ALL_PROFILE_VIDEOS.length
                : data.ALL_CONTENT.length
            }
            isLoading={data.isLoadingContent}
          />
        )}
        <StableHeightContainer activeTab={activeTab}>
            <ProfileTabContent
              activeTab={activeTab}
              profileAddress={data.apiProfile?.walletAddress || ''}
              ALL_CONTENT={data.ALL_CONTENT}
              PROFILE_POSTS={data.PROFILE_POSTS}
              PROFILE_IMAGES={data.PROFILE_IMAGES}
              ALL_PROFILE_VIDEOS={data.ALL_PROFILE_VIDEOS}
              PROFILE_LIVE={data.PROFILE_LIVE}
              isLoadingContent={data.isLoadingContent}
              userContentData={data.userContentData}
              hasNextContentPage={data.hasNextContentPage}
              isFetchingNextContentPage={data.isFetchingNextContentPage}
              fetchNextContentPage={data.fetchNextContentPage}
              isTargetPrivate={data.isTargetPrivate}
              isFollowing={data.isFollowing}
              isPending={data.isPending}
              isViewingOwnProfile={data.isViewingOwnProfile}
              isContentFiltered={data.isContentFiltered}
              optimisticPosts={data.optimisticPosts}
              isLoadingPlans={data.isLoadingPlans}
              hasPlans={data.hasPlans}
              plans={data.plans}
              isSubscribed={data.isSubscribed}
              profile={data.profile}
              setCreatePlanModalOpen={setCreatePlanModalOpen}
              setEditingPlan={setEditingPlan}
            />

        </StableHeightContainer>
        </div>
      </div>

      {/* Make Offer Drawer */}
      <Drawer open={offerDrawerOpen} onOpenChange={setOfferDrawerOpen}>
        <DrawerContent column glass hideHandle={false} className="px-4 pb-8">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white">{t('profile.makeOffer', { handle: data.profile.handle })}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              {t('profile.enterOfferAmount')}
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="pl-8 pr-14 bg-zinc-800 border-zinc-700 text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">
                USD
              </span>
            </div>
            {offerDhb !== null && (
              <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                <img src={dehubCoin} alt={tokenLabel()} className="w-3.5 h-3.5" />
                {t('profile.offerWorthNow', { amount: offerDhb.toLocaleString(undefined, { maximumFractionDigits: 0 }) })}
              </p>
            )}
            <Input
              placeholder={t('profile.offerNotePlaceholder')}
              value={offerMessage}
              onChange={(e) => setOfferMessage(e.target.value)}
              maxLength={280}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
            {/* The single most important line in the drawer. Nothing is spent
                here, and the previous version of this screen said nothing at
                all — which read as though the money had gone. */}
            <p className="text-[11px] text-zinc-400 rounded-lg border border-white/10 bg-white/5 p-2">
              {t('profile.offerCommitsNothing')}
            </p>
            <Button 
              onClick={handleSubmitOffer}
              disabled={createOffer.isPending}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white"
            >
              {t('profile.submitOffer')}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Fullscreen image viewer */}
      <FullscreenImageViewerLazy
        images={fullscreenImage ? [fullscreenImage] : []}
        initialIndex={0}
        isOpen={!!fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />
      
      {/* Create Plan Modal */}
      <CreatePlanModal
        open={createPlanModalOpen}
        onOpenChange={setCreatePlanModalOpen}
      />

      {/* Edit Plan Modal */}
      {editingPlan && (
        <EditPlanModal
          open={!!editingPlan}
          onOpenChange={(open) => { if (!open) setEditingPlan(null); }}
          plan={editingPlan}
        />
      )}

      <FollowersListDrawer
        open={followListDrawerOpen}
        onOpenChange={setFollowListDrawerOpen}
        profileAddress={data.apiProfile?.walletAddress || ''}
        listType={followListType}
      />
      
      {/* Login Modal */}
      <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />

      {/* Tip Modal */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        creatorAddress={data.profile?.walletAddress}
        creatorName={data.profile?.name}
        tokenId="0"
      />
    </div>
  );

  return profileContent;
}
