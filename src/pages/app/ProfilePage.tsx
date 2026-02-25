import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate, useLocation } from 'react-router-dom';
import { AtSign, ChevronLeft, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/app/AppLayout';
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
import { ProfileHeader } from '@/components/app/profile/ProfileHeader';
import { ProfileTabContent } from '@/components/app/profile/ProfileTabContent';
import { ProfileOptionsContent } from '@/components/app/profile/ProfileOptionsDrawer';
import type { TabValue } from '@/components/app/profile/ProfileConstants';
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

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  
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

  const tabsIndicatorLayerRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Partial<Record<TabValue, HTMLButtonElement | null>>>({});
  const [tabIndicator, setTabIndicator] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const updateTabIndicator = useCallback(() => {
    const layerEl = tabsIndicatorLayerRef.current;
    const activeButton = tabButtonRefs.current[activeTab];

    if (!layerEl || !activeButton) return;

    const layerRect = layerEl.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setTabIndicator({
      x: buttonRect.left - layerRect.left,
      y: buttonRect.top - layerRect.top,
      width: buttonRect.width,
      height: buttonRect.height,
      ready: true,
    });
  }, [activeTab]);

  const handleTabsScroll = useCallback(() => {
    window.requestAnimationFrame(updateTabIndicator);
  }, [updateTabIndicator]);

  useLayoutEffect(() => {
    updateTabIndicator();
  }, [updateTabIndicator, data.PROFILE_TABS.length]);

  useEffect(() => {
    const onResize = () => window.requestAnimationFrame(updateTabIndicator);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateTabIndicator]);
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

  // Loading state
  if (data.isAuthLoading || data.isLoadingProfile) {
    const loadingContent = (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
    if (data.needsLayoutWrapper) {
      return <AppLayout>{loadingContent}</AppLayout>;
    }
    return loadingContent;
  }

  // Auth gate for own profile
  if (data.isOwnProfile && !data.isAuthenticated) {
    const authGateContent = (
      <AuthGate description={t('profile.loginDescription')} />
    );
    if (data.needsLayoutWrapper) {
      return <AppLayout>{authGateContent}</AppLayout>;
    }
    return authGateContent;
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
          </>
        )}
      </div>
    );
    
    if (data.needsLayoutWrapper) {
      return <AppLayout>{notFoundContent}</AppLayout>;
    }
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
        />

        {/* Profile Tabs Bento */}
        <div className="bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/[0.08] rounded-2xl p-1.5 relative overflow-visible">
          <div ref={tabsIndicatorLayerRef} className="relative overflow-visible py-1">
            {tabIndicator.ready && (
              <motion.div
                className="pointer-events-none absolute z-30 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                animate={{
                  x: tabIndicator.x,
                  y: tabIndicator.y,
                  width: tabIndicator.width,
                  height: tabIndicator.height,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}

            <div
              className="relative z-20 flex gap-0.5 overflow-x-auto scrollbar-hide"
              onScroll={handleTabsScroll}
            >
              {data.PROFILE_TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    ref={(el) => {
                      tabButtonRefs.current[tab.value] = el;
                    }}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      'relative z-40 flex-1 flex flex-col items-center gap-0.5 px-2 pt-[7px] pb-[5px] rounded-xl transition-colors min-w-[52px]',
                      isActive ? 'text-white' : 'text-zinc-500 hover:text-white'
                    )}
                  >
                    <tab.icon className="w-[18px] h-[18px] relative z-10" />
                    <span className="text-[10px] font-medium relative z-10">{tab.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-black/40 to-transparent pointer-events-none rounded-r-2xl z-10" />
        </div>

        {/* Tab Content - all panels rendered, inactive hidden via CSS */}
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

      {/* Make Offer Drawer */}
      <Drawer open={offerDrawerOpen} onOpenChange={setOfferDrawerOpen}>
        <DrawerContent glass className="px-4 pb-8">
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
        context="profile"
      />
    </div>
  );

  if (data.needsLayoutWrapper) {
    return <AppLayout>{profileContent}</AppLayout>;
  }

  return profileContent;
}
