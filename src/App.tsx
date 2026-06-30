import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OptimisticPostsProvider } from "@/hooks/use-optimistic-posts";
import { UsernameRequiredModal } from "@/components/app/modals";
import { LoginModal } from "@/components/app/LoginModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePreloadIcons } from "@/hooks/use-preload-icons";
import { AppLayout } from "./components/app/AppLayout";
import React, { Suspense, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18nInstance from "@/i18n";
import { HelmetProvider } from "react-helmet-async";
import { SEOHead } from "@/components/SEOHead";
import { HomeShellSkeleton } from "@/components/app/PageSkeletons";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CosmicBackground } from "@/components/app/CosmicBackground";

// Wallet/Auth providers — lazy loaded to keep them out of the main bundle.
// Wagmi + RainbowKit + Web3Auth total ~1.5 MB; deferring them reduces TBT significantly.
const WalletProviders = React.lazy(() =>
  import("./components/app/WalletProviders").then(m => ({ default: m.WalletProviders }))
);


// Pages — lazy loaded
const Index = React.lazy(() => import("./pages/Index"));
const DeleteAccount = React.lazy(() => import("./pages/DeleteAccount"));
const CreatorsPage = React.lazy(() => import("./pages/app/CreatorsPage"));
const SkillPage = React.lazy(() => import("./pages/SkillPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const AdminLoginPage = React.lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminUsersPage = React.lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminRoute = React.lazy(() =>
  import("./components/admin/AdminRoute").then((m) => ({ default: m.AdminRoute }))
);
const DocsPage = React.lazy(() => import("./pages/DocsPage"));
const ProfilePage = React.lazy(() => import("./pages/app/ProfilePage"));
const PostInfoPage = React.lazy(() => import("./pages/app/PostInfoPage"));
const SinglePostPage = React.lazy(() => import("./pages/app/SinglePostPage"));
const GovernanceProposalPage = React.lazy(() => import("./pages/app/GovernanceProposalPage"));
const StageDeepLinkPage = React.lazy(() => import("./pages/app/StageDeepLinkPage"));
const MobilePreview = React.lazy(() => import("./pages/MobilePreview"));
const GuidePage = React.lazy(() => import("./pages/GuidePage"));
const PromptLanding = React.lazy(() => import("./pages/PromptLanding"));
const CommunityPage = React.lazy(() => import("./pages/app/CommunityPage"));
const EventPage = React.lazy(() => import("./pages/EventPage"));
const StoreDetailPage = React.lazy(() => import("./pages/app/StoreDetailPage"));
const LaunchpadPage = React.lazy(() => import("./pages/app/LaunchpadPage"));
const LaunchpadCreatePage = React.lazy(() => import("./pages/app/LaunchpadCreatePage"));
const LaunchpadCoinPage = React.lazy(() => import("./pages/app/LaunchpadCoinPage"));
const WorkPostPage = React.lazy(() => import("./pages/app/WorkPostPage"));
const WorkJobDetailPage = React.lazy(() => import("./pages/app/WorkJobDetailPage"));
const WorkDisputesPage = React.lazy(() => import("./pages/app/WorkDisputesPage"));
const EditorPage = React.lazy(() => import("./pages/Editor"));
const ReferralLanding = React.lazy(() => import("./pages/ReferralLanding"));
const PremiumPage = React.lazy(() => import("./pages/Premium"));


const SKIP_LANDING_KEY = "dehub_skip_landing";


// Empty fallback — the HTML boot shell (outside #root) handles first-paint visuals,
// so React's Suspense fallback should be invisible to avoid a second loading stage.
const PageLoader = () => null;

/**
 * One-time cache migration for existing testers.
 * Clears stale auth/wagmi/web3auth data after auth flow changes.
 * Bump CURRENT_CACHE_VERSION to force another clear in the future.
 */
const CURRENT_CACHE_VERSION = '2';
function migrateStaleCacheOnce() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('dehub_cache_version') === CURRENT_CACHE_VERSION) return;

  ['dehub_token', 'dehub_token_timestamp', 'dehub_wallet', 'dehub_user',
   'dehub_connection_source', 'dehub_deployed_sa'].forEach(k => localStorage.removeItem(k));

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('wagmi') || key.startsWith('@appkit') || key.startsWith('@w3m') ||
      key.startsWith('wc@') || key.startsWith('WCM@') || key.startsWith('W3M') ||
      key.startsWith('Web3Auth') || key.startsWith('openlogin')
    )) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  localStorage.setItem('dehub_cache_version', CURRENT_CACHE_VERSION);
}
if (typeof window !== 'undefined') {
  migrateStaleCacheOnce();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Hero route — renders immediately with NO wallet dependencies.
 * WalletProviders (~1.5 MB) is preloaded in the background while the user
 * watches the 3D nebula animation, so by the time they click "Enter App"
 * the heavy chunk is already cached and the transition is instant.
 */
function HeroRoute() {
  // Kick off WalletProviders chunk download in the background immediately.
  // By the time the user clicks Enter (5-30s), it will be fully loaded.
  useEffect(() => {
    import("./components/app/WalletProviders");
  }, []);

  // Landing page temporarily disabled — always redirect straight into the app.
  // The Index page (Welcome To Our World hero) is preserved at src/pages/Index.tsx
  // and can be re-enabled by restoring the SKIP_LANDING_KEY check below.
  return <Navigate to="/app" replace />;

  // eslint-disable-next-line no-unreachable
  const shouldSkip = localStorage.getItem(SKIP_LANDING_KEY) === 'true';
  if (shouldSkip) {
    return <Navigate to="/app" replace />;
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Index />
    </Suspense>
  );
}

/**
 * Authenticated app shell — everything that needs WalletProviders / AuthProvider.
 * Only mounted after user has passed the hero (or is a returning user).
 */
function AppContent() {
  const { isLoginModalOpen, closeLoginModal, user, walletAddress } = useAuth();
  usePreloadIcons();

  // Capture ?ref=CODE / ?aff=CODE on first load (first-touch wins, 90-day cookie).
  useEffect(() => {
    import("@/lib/affiliateRef").then(m => m.captureAffiliateRefFromUrl());
  }, []);

  // When a wallet signs in, self-attribute any pending cookie referral.
  const wallet = walletAddress ?? (user as { walletAddress?: string | null; address?: string | null } | null)?.walletAddress ?? (user as { address?: string | null } | null)?.address ?? null;
  useEffect(() => {
    if (!wallet) return;
    import("@/lib/affiliate").then(m => m.attributeReferralIfPending(wallet)).catch(() => undefined);
  }, [wallet]);


  return (
    <>
      <UsernameRequiredModal />
      <LoginModal open={isLoginModalOpen} onOpenChange={closeLoginModal} />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Root redirect — landing hero disabled, send users straight into the app */}
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/mobile-preview" element={<MobilePreview />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/*" element={<DocsPage />} />

          <Route path="/delete-account" element={<DeleteAccount />} />

          {/* Admin panel — email/password auth, separate from user wallet session */}
          <Route path="/admin/login" element={<Suspense fallback={<PageLoader />}><AdminLoginPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminRoute /></Suspense>}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsersPage /></Suspense>} />
          </Route>

          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/skill.md" element={<SkillPage />} />
          <Route path="/editor" element={<Suspense fallback={<PageLoader />}><EditorPage /></Suspense>} />
          <Route path="/r/:code" element={<Suspense fallback={<PageLoader />}><ReferralLanding /></Suspense>} />
          <Route path="/prompt" element={<Suspense fallback={<PageLoader />}><PromptLanding /></Suspense>} />
          <Route path="/premium" element={<Suspense fallback={<PageLoader />}><PremiumPage /></Suspense>} />


          {/* Single shared AppLayout — header/sidebar mount ONCE and persist across all app routes */}
          <Route element={<AppLayout />}>
            <Route path="/jobs" element={null} />
            <Route path="/features" element={null} />
            <Route path="/governance" element={null} />
            <Route path="/stake" element={null} />
            <Route path="/communities" element={null} />
            <Route path="/communities/:slug" element={<Suspense fallback={<PageLoader />}><CommunityPage /></Suspense>} />

            {/* App routes — cached pages render null, PersistentPageCache manages them */}
            <Route path="/app">
              <Route index element={null} />
              <Route path="affiliate" element={null} />
              <Route path="explore" element={null} />
              <Route path="profile" element={null} />
              <Route path="notifications" element={null} />
              <Route path="messages" element={null} />
              <Route path="assistant" element={null} />
              <Route path="leaderboard" element={null} />
              <Route path="bookmarks" element={null} />
              <Route path="settings" element={null} />
              <Route path="command-centre" element={null} />
              <Route path="wallet" element={null} />
              <Route path="music" element={null} />
              <Route path="buy" element={null} />
              <Route path="agents" element={null} />
              <Route path="tv" element={null} />
              <Route path="features" element={null} />
              <Route path="governance" element={null} />
              <Route path="governance/:proposalId" element={<Suspense fallback={<PageLoader />}><GovernanceProposalPage /></Suspense>} />
              <Route path="stake" element={null} />
              <Route path="bridge" element={null} />
              <Route path="top-100" element={null} />
              <Route path="jobs" element={null} />
              <Route path="glossary" element={null} />
              <Route path="events" element={null} />
              <Route path="events/:eventNumber" element={<Suspense fallback={<PageLoader />}><EventPage /></Suspense>} />
              <Route path="communities" element={null} />
              <Route path="stores" element={null} />
              <Route path="stores/:storeId" element={<Suspense fallback={<PageLoader />}><StoreDetailPage /></Suspense>} />
              <Route path="work" element={null} />
              <Route path="work/post" element={<Suspense fallback={<PageLoader />}><WorkPostPage /></Suspense>} />
              <Route path="work/disputes" element={<Suspense fallback={<PageLoader />}><WorkDisputesPage /></Suspense>} />
              <Route path="work/:jobId" element={<Suspense fallback={<PageLoader />}><WorkJobDetailPage /></Suspense>} />

              <Route path="communities/:slug" element={<Suspense fallback={<PageLoader />}><CommunityPage /></Suspense>} />
              <Route path="post/:postId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
              <Route path="video/:tokenId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
              <Route path="post/:postId/info" element={<Suspense fallback={<PageLoader />}><PostInfoPage /></Suspense>} />
              {/* Launchpad — hidden, no nav links, reachable by URL only */}
              <Route path="launchpad" element={<Suspense fallback={<PageLoader />}><LaunchpadPage /></Suspense>}>
                <Route path="create" element={<Suspense fallback={null}><LaunchpadCreatePage /></Suspense>} />
              </Route>
              <Route path="launchpad/:mintId" element={<Suspense fallback={<PageLoader />}><LaunchpadCoinPage /></Suspense>} />
            </Route>

            {/* /work aliases */}
            <Route path="/work" element={null} />
            <Route path="/work/post" element={<Suspense fallback={<PageLoader />}><WorkPostPage /></Suspense>} />
            <Route path="/work/disputes" element={<Suspense fallback={<PageLoader />}><WorkDisputesPage /></Suspense>} />
            <Route path="/work/:jobId" element={<Suspense fallback={<PageLoader />}><WorkJobDetailPage /></Suspense>} />

            {/* /affiliate alias (page itself is rendered by PersistentPageCache) */}
            <Route path="/affiliate" element={null} />

            {/* Stage invite links */}
            <Route path="/stage/:id" element={<Suspense fallback={<PageLoader />}><StageDeepLinkPage /></Suspense>} />

            {/* Launchpad — public URL alias (hidden, no nav links) */}
            <Route path="/launchpad" element={<Suspense fallback={<PageLoader />}><LaunchpadPage /></Suspense>}>
              <Route path="create" element={<Suspense fallback={null}><LaunchpadCreatePage /></Suspense>} />
            </Route>
            <Route path="/launchpad/:mintId" element={<Suspense fallback={<PageLoader />}><LaunchpadCoinPage /></Suspense>} />

            {/* Username profiles — inside shared layout so header never remounts */}
            <Route path="/:username" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

const WalletLoader = () => null;

const App = () => (
  <HelmetProvider>
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={queryClient}>
        {/*
         * BrowserRouter is now OUTSIDE WalletProviders so the hero route (/)
         * can render immediately without waiting for the ~1.5 MB wallet chunk.
         */}
        <BrowserRouter>
          <SEOHead />
          <Sonner />
          {/*
           * Landing hero is currently disabled — `/` redirects straight into the app.
           * The HeroRoute component and Index page (Welcome To Our World) are preserved
           * in this file / src/pages/Index.tsx and can be re-enabled by restoring the
           * `<Route path="/" element={<HeroRoute />} />` entry above the wallet tree.
           *
           * All routes (including `/`) now go through WalletProviders. The redirect
           * from `/` to `/app` happens inside AppContent's <Routes>, so HeroRoute
           * never mounts on initial load.
           */}
          <Suspense fallback={<WalletLoader />}>
            <WalletProviders>
              <ThemeProvider>
                <OptimisticPostsProvider>
                  <TooltipProvider>
                    <CosmicBackground />
                    <AppContent />
                  </TooltipProvider>
                </OptimisticPostsProvider>
              </ThemeProvider>
            </WalletProviders>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </HelmetProvider>
);

export default App;
