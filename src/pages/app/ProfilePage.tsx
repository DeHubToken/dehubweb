import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useTranslation } from 'react-i18next';

import { useNavigate, useLocation } from 'react-router-dom';
import { AtSign, ChevronLeft, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { LoginModal } from '@/components/app/LoginModal';
import { AuthGate } from '@/components/app/AuthGate';
import { FullscreenImageViewer } from '@/components/app/cards/FullscreenImageViewer';
import { CreatePlanModal, EditPlanModal } from '@/components/app/subscriptions';
import { TipModal } from '@/components/app/modals/TipModal';
import { FollowersListDrawer } from '@/components/app/profile';
import { StoryViewerModal } from '@/components/app/stories/StoryViewerModal';
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
import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildFeedImageUrls, buildVideoUrl } from '@/lib/media-url';
import { ProfileHeader } from '@/components/app/profile/ProfileHeader';
import { ProfileTabContent } from '@/components/app/profile/ProfileTabContent';
import { ProfileSkeleton } from '@/components/app/profile/ProfileSkeleton';
import { ProfileOptionsContent } from '@/components/app/profile/ProfileOptionsDrawer';
import { parseDefaultProfileTab, type TabValue } from '@/components/app/profile/ProfileConstants';
import type { SubscriptionPlan } from '@/lib/api/dehub';

/**
 * Wraps tab content and remembers the max height ever rendered.
 * When switching to a shorter tab, the container keeps its previous
 * height so the page never shrinks and the scroll position stays put.
 * The locked height is released after a brief delay so the container
 * can grow naturally if new content loads.
 */
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
    <div ref={ref} style={{ minHeight: minH > 0 ? `${minH}px` : undefined }}>
      {children}
    </div>
  );
}

function PinnedPostItem({ pin }: { pin: any }) {
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
        <span className="text-xs text-zinc-400 font-medium">Pinned post</span>
      </div>
      {(postType === 'video' || postType === 'audio' || postType === 'feed-audio') ? (
        <VideoCard video={{
          id: String(post.tokenId), type: 'video',
          thumbnail: buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg',
          videoUrl: buildVideoUrl(post.tokenId),
          title: post.title || post.name || '',
          channel: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
          channelAvatar: avatar, verified: false,
          views: formatViews(post.views || 0).replace(' views', ''),
          uploadedAgo: formatTimeAgo(rawTimestamp),
          duration: '', durationSeconds: 0,
          likeCount: post.totalVotes?.for || 0, dislikeCount: post.totalVotes?.against || 0,
          commentCount: post.commentCount || 0, repostCount: (post.totalReposts || 0) + (post.quotes || 0),
          isOwner: false, isUnlocked: false,
          creatorId: resolvedAddress,
          creatorUsername: post.minterUsername || creatorObj?.username,
        }} />
      ) : postType === 'image' || postType === 'feed-images' ? (
        <ImageCard post={{
          id: String(post.tokenId), type: 'image',
          username: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
          verified: false, avatar,
          image: buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg',
          imageUrls: buildFeedImageUrls(post.imageUrls) || [buildImageUrl(post.tokenId, post.imageUrl) || '/placeholder.svg'],
          caption: post.description || '', likes: post.totalVotes?.for || 0,
          comments: post.commentCount || 0, views: formatViews(post.views || 0).replace(' views', ''),
          timeAgo: formatTimeAgo(rawTimestamp),
          creatorId: resolvedAddress,
          creatorUsername: post.minterUsername || creatorObj?.username,
          isOwner: false, isUnlocked: false,
          repostCount: (post.totalReposts || 0) + (post.quotes || 0),
        }} />
      ) : (
        <PostCard post={{
          id: String(post.tokenId), type: 'post',
          createdAt: rawTimestamp || '',
          views: formatViews(post.views || 0).replace(' views', ''),
          author: {
            id: resolvedAddress,
            name: post.minterDisplayName || post.minterUsername || creatorObj?.display_name || 'Unknown',
            handle: post.minterUsername || creatorObj?.username || resolvedAddress?.slice(0, 8) || 'anon',
            avatarSeed: avatar, verified: false,
          },
          content: post.description || post.name || '',
          stats: {
            comments: post.commentCount || 0,
            reposts: (post.totalReposts || 0) + (post.quotes || 0),
            likes: post.totalVotes?.for || 0,
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // UI-only state managed in orchestrator
  const [activeTab, setActiveTab] = useState<TabValue>('home');
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false);
  const [offerDrawerOpen, setOfferDrawerOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [followListDrawerOpen, setFollowListDrawerOpen] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [showAvatarOverlay, setShowAvatarOverlay] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  

  // All data fetching + derived state
  const data = useProfilePage();

  // Land on the tab the profile owner chose to show first. Applied once per
  // profile (keyed by wallet address) so a visitor's own tab clicks afterwards
  // aren't clobbered, and navigating to a different profile re-applies theirs.
  const appliedDefaultTabFor = useRef<string | null>(null);
  const profileKey = data.apiProfile?.walletAddress || null;
  useEffect(() => {
    if (!profileKey || appliedDefaultTabFor.current === profileKey) return;
    appliedDefaultTabFor.current = profileKey;
    setActiveTab(parseDefaultProfileTab(
      (data.apiProfile?.customs as Record<string, unknown> | undefined)?.defaultProfileTab
    ));
  }, [profileKey, data.apiProfile?.customs]);


  // Swallow the tab content at the sticky tabs bento's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const profileContentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(profileContentRef, '[data-feed-nav-outer] > [data-page-bento]');

  // Detect when the tabs pill is anchored to the top. Once stuck there's no
  // horizontal-scroll affordance to hint at, so we drop the right-edge fade —
  // its fade-to-transparent is where scrolled posts bleed through the pill.
  // The pill itself keeps its liquid-glass look; only the fade edge changes.
  const stuckSentinelRef = useRef<HTMLDivElement>(null);
  const [isTabsStuck, setIsTabsStuck] = useState(false);
  useEffect(() => {
    const el = stuckSentinelRef.current;
    if (!el) return;
    const topOffset = isMobile ? 44 : 0; // matches sticky top-11 / lg:top-0
    const obs = new IntersectionObserver(
      ([entry]) => setIsTabsStuck(!entry.isIntersecting),
      { rootMargin: `-${topOffset + 1}px 0px 0px 0px`, threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isMobile]);

  const { layerRef: tabsIndicatorLayerRef, setRef: setTabRef, rect: tabIndicator, onScroll: handleTabsScroll } = useTabIndicator(activeTab);
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
      onTip={!data.isViewingOwnProfile ? () => setShowTipModal(true) : undefined}
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

  const handleSubmitOffer = () => {
    if (!offerAmount || parseFloat(offerAmount) <= 0) {
      toast.error(t('profile.validOfferAmount'));
      return;
    }
    toast.success(t('profile.offerSubmitted', { amount: offerAmount, handle: data.profile?.handle || 'user' }));
    setOfferDrawerOpen(false);
    setOfferAmount('');
  };

  // Loading state — show skeleton only if we don't have profile data yet.
  // Don't re-show skeleton when auth resolves (keepPreviousData handles the transition).
  // Also show skeleton if profile errored but auth is still loading or profile is refetching
  // (race condition: private profiles return empty shell before auth token is available).
  if (!data.profile && (data.isAuthLoading || data.isLoadingProfile || data.isFetchingProfile)) {
    return <ProfileSkeleton />;
  }

  // Auth gate for own profile
  if (data.isOwnProfile && !data.isAuthenticated) {
    return <AuthGate description={t('profile.loginDescription')} />;
  }

  // No profile found
  if (!data.profile) {
    const isUsernameRoute = !!data.routeUsername;
    const displayUsername = data.routeUsername || '';
    
    const notFoundContent = (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4 text-center">
        {isUsernameRoute && !data.isProfileError ? (
          <>
            <div className="w-20 h-20 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <AtSign className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">{t('profile.usernameAvailable')}</h2>
              <p className="text-zinc-400 max-w-md">
                {t('profile.signUpToClaim')} <span className="text-white font-medium">dehub.io/{displayUsername}</span>
              </p>
            </div>
            <Button
              onClick={() => setLoginModalOpen(true)}
              className="h-12 px-8 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
            >
              {t('profile.signUp')}
            </Button>
            <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-xl bg-zinc-800 flex items-center justify-center">
              <AtSign className="w-10 h-10 text-zinc-500" />
            </div>
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
      className="min-h-screen"
      onTouchStart={data.pullHandlers.onTouchStart}
      onTouchMove={data.pullHandlers.onTouchMove}
      onTouchEnd={data.pullHandlers.onTouchEnd}
      onMouseDown={data.pullHandlers.onMouseDown}
      onMouseMove={data.pullHandlers.onMouseMove}
      onMouseUp={data.pullHandlers.onMouseUp}
      onMouseLeave={data.pullHandlers.onMouseLeave}
    >
      <SEOHead
        title={data.profile?.name || data.profile?.handle || 'Profile'}
        description={data.profile?.bio || `View ${data.profile?.name || data.profile?.handle || 'this profile'} on DeHub`}
        url={`https://dehub.io/${data.profile?.handle || ''}`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: data.profile?.name || data.profile?.handle || 'DeHub User',
          url: `https://dehub.io/${data.profile?.handle || ''}`,
          ...(data.profile?.bio && { description: data.profile.bio }),
          ...(data.profile?.avatarUrl && { image: data.profile.avatarUrl }),
          sameAs: `https://dehub.io/${data.profile?.handle || ''}`,
        }}
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
      
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Back button */}
        {location.key !== 'default' && (
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="rounded-xl text-white hover:bg-white/10 gap-2 px-3"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>{t('profile.back')}</span>
            </Button>
          </div>
        )}
        
        {/* Profile Card Bento */}
        <ProfileHeader
          profile={data.profile}
          apiProfile={data.apiProfile}
          isViewingOwnProfile={data.isViewingOwnProfile}
          isAuthenticated={data.isAuthenticated}
          badgeUrl={data.badgeUrl}
          isFollowing={data.isFollowing}
          isPending={data.isPending}
          isTargetPrivate={data.isTargetPrivate}
          isFollowLoading={isFollowLoading}
          handleFollow={handleFollow}
          handleUnfollow={handleUnfollow}
          isSubscribed={data.isSubscribed}
          hasPlans={data.hasPlans}
          hasStories={data.hasStories}
          hasUnwatchedStories={data.hasUnwatchedStories}
          profileStories={data.profileStories}
          markWatched={data.markWatched}
          showAvatarOverlay={showAvatarOverlay}
          setShowAvatarOverlay={setShowAvatarOverlay}
          setFullscreenImage={setFullscreenImage}
          setActiveTab={setActiveTab}
          setIsStoryViewerOpen={setIsStoryViewerOpen}
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

        {/* Profile Tabs Bento — sticky wrapper mirrors the home feed nav pill
            (same top offset, background swallow, and mobile hide-on-scroll).
            Negative x/bottom margins cancel the parent's p-* / space-y-* so the
            in-flow layout is unchanged; the padding recreates it inside the
            wrapper so the bg covers the gap while stuck. */}
        {/* Zero-height sentinel just above the sticky wrapper; when it scrolls
            past the sticky top line the IntersectionObserver flags the pill as
            stuck. */}
        <div ref={stuckSentinelRef} aria-hidden className="h-0" />
        {/* Anchor the tabs pill above the feed at every breakpoint, exactly like
            desktop: sticky at the top (below the fixed mobile header on
            mobile/tablet, top-0 on desktop) with no hide-on-scroll. The old
            mobile transform yanked the pill up over the profile header while it
            was still mid-flow — not yet stuck — so it jumped and vanished
            erratically. Keeping it pinned lets the swallow clip cut content
            continuously at the pill's top edge, matching the home feed. */}
        <div
          data-feed-nav-outer
          className="sticky top-11 lg:top-0 bg-black z-50 -mx-2 sm:-mx-3 -mb-2 sm:-mb-3 px-2 sm:px-3 pt-1 pb-2 sm:pb-3 lg:pt-2"
        >
        <div data-page-bento className="bg-zinc-900 rounded-xl relative" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
          <div ref={tabsIndicatorLayerRef} className="relative overflow-visible">
            <GlassIndicator rect={profileDragDisplayRect} borderRadius="0.75rem" enableTransition={!isProfileDragging && tabTransition} />
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
              className="relative z-20 flex overflow-x-auto scrollbar-hide"
              style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch', willChange: 'scroll-position' } as React.CSSProperties}
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
                    className={cn(
                      'relative z-40 flex-1 flex flex-col items-center justify-center gap-px px-2 py-[9px] rounded-xl transition-colors min-w-[52px]',
                      isActive ? 'text-white' : 'text-zinc-500 hover:text-white'
                    )}
                  >
                    <tab.icon className="w-[18px] h-[18px] relative z-10" />
                    <span className="text-[10px] leading-tight font-medium relative z-10">{tab.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Side-scroll fade — its fade-to-transparent right end is the clear
              sliver scrolled posts bleed through. Only meaningful before the
              pill anchors, so drop it while stuck: the right edge then reverts
              to the pill's own surface (solid in the default theme, uniform
              glass in the glass themes) with no see-through sliver. */}
          {!isTabsStuck && (
            <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none rounded-r-xl z-10" />
          )}
        </div>
        </div>

        {/* Tab Content - all panels rendered, inactive hidden via CSS */}
        <div ref={profileContentRef}>
        <StableHeightContainer activeTab={activeTab}>
            <ProfileTabContent
              activeTab={activeTab}
              profileAddress={data.apiProfile?.walletAddress || ''}
              ALL_CONTENT={data.ALL_CONTENT}
              PROFILE_POSTS={data.PROFILE_POSTS}
              PROFILE_IMAGES={data.PROFILE_IMAGES}
              ALL_PROFILE_VIDEOS={data.ALL_PROFILE_VIDEOS}
              isLoadingContent={data.isLoadingContent}
              userContentData={data.userContentData}
              hasNextContentPage={data.hasNextContentPage}
              isFetchingNextContentPage={data.isFetchingNextContentPage}
              fetchNextContentPage={data.fetchNextContentPage}
              isTargetPrivate={data.isTargetPrivate}
              isFollowing={data.isFollowing}
              isPending={data.isPending}
              isViewingOwnProfile={data.isViewingOwnProfile}
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
        <DrawerContent glass hideHandle={false} className="px-4 pb-8">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white">{t('profile.makeOffer', { handle: data.profile.handle })}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              {t('profile.enterOfferAmount')}
            </p>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
              </div>
              <Input
                type="number"
                placeholder="0"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                className="pl-10 pr-14 bg-zinc-800 border-zinc-700 text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">
                DHB
              </span>
            </div>
            <Button 
              onClick={handleSubmitOffer}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white"
            >
              {t('profile.submitOffer')}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Fullscreen image viewer */}
      <FullscreenImageViewer
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
        title={followListType === 'followers' ? 'Followers' : 'Following'}
      />
      
      {/* Story Viewer Modal */}
      <StoryViewerModal
        isOpen={isStoryViewerOpen}
        onClose={() => setIsStoryViewerOpen(false)}
        stories={data.allStories}
        initialIndex={data.profileStoryStartIndex}
        onStoryWatched={data.markWatched}
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
