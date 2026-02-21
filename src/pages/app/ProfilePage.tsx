import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AtSign, ChevronLeft, Loader2 } from 'lucide-react';
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

export default function ProfilePage() {
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
    />
  );

  // Make Offer handler (from options drawer)
  const handleMakeOffer = () => {
    setShareSheetOpen(false);
    setOfferDrawerOpen(true);
  };

  const handleSubmitOffer = () => {
    if (!offerAmount || parseFloat(offerAmount) <= 0) {
      toast.error('Please enter a valid offer amount');
      return;
    }
    toast.success(`Offer of ${offerAmount} DHB submitted for ${data.profile?.handle || 'user'}`);
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
      <AuthGate description="Log in to view and manage your profile." />
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
              <h2 className="text-2xl font-bold text-white">Username available!</h2>
              <p className="text-zinc-400 max-w-md">
                Sign up today to claim <span className="text-white font-medium">dehub.io/{displayUsername}</span>
              </p>
            </div>
            <Button
              onClick={() => setLoginModalOpen(true)}
              className="h-12 px-8 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
            >
              Sign Up
            </Button>
            <LoginModal open={loginModalOpen} onOpenChange={setLoginModalOpen} />
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-xl bg-zinc-800 flex items-center justify-center">
              <AtSign className="w-10 h-10 text-zinc-500" />
            </div>
            <h2 className="text-xl font-bold text-white">Profile Not Found</h2>
            <p className="text-zinc-400 max-w-md">
              {data.isProfileError 
                ? "Unable to load profile. Please try again later."
                : "This user doesn't exist or you need to log in to view your profile."}
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
              <span>Back</span>
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
        />

        {/* Profile Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2 relative">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {data.PROFILE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[60px]',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none rounded-r-2xl" />
        </div>

        {/* Tab Content */}
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
      </div>

      {/* Make Offer Drawer */}
      <Drawer open={offerDrawerOpen} onOpenChange={setOfferDrawerOpen}>
        <DrawerContent glass className="px-4 pb-8">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white">Make Offer for {data.profile.handle}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              Enter the amount of DHB tokens you'd like to offer to acquire this username.
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
              Submit Offer
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
