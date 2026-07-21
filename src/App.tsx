import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OptimisticPostsProvider } from "@/hooks/use-optimistic-posts";
// Direct import (not the modals barrel) so the barrel's other modals stay out
// of the entry bundle.
import { UsernameRequiredModal } from "@/components/app/modals/UsernameRequiredModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePreloadIcons } from "@/hooks/use-preload-icons";
import { prefetchUnifiedFeed } from "@/hooks/use-unified-feed";
import { restoreQueryCache, startQueryPersist } from "@/lib/query-persist";
import { AppLayout } from "./components/app/AppLayout";
import React, { Suspense, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18nInstance from "@/i18n";
import { HelmetProvider } from "react-helmet-async";
import { SEOHead } from "@/components/SEOHead";
import { HomeShellSkeleton } from "@/components/app/PageSkeletons";
import { ThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SurfaceTransition } from "@/components/transitions/SurfaceTransition";

// Wallet/Auth providers — lazy loaded to keep them out of the main bundle.
// Wagmi + RainbowKit + Web3Auth total ~1.5 MB; deferring them reduces TBT significantly.
// lazyWithRetry (not plain React.lazy): this chunk contains the entire auth
// system, so a stale-deploy chunk 404 here means login doesn't exist at all —
// it gets one extra same-page retry before falling back to the ErrorBoundary's
// reload-once handling.
const WalletProviders = lazyWithRetry(() =>
  import("./components/app/WalletProviders").then(m => ({ default: m.WalletProviders }))
);
// Kick off the wallet chunk download at module-eval time (before React even
// mounts) so it arrives as early as possible; React.lazy above reuses the
// same in-flight request.
if (typeof window !== "undefined") {
  import("./components/app/WalletProviders").catch(() => {});
}

// Login modal — lazy so RainbowKit/web3auth UI code stays in the wallet-side
// chunks. Mounted on first open (see AppContent latch), preloaded on idle.
const LoginModal = React.lazy(() =>
  import("@/components/app/LoginModal").then(m => ({ default: m.LoginModal }))
);

// Decorative theme backgrounds — lazy AND theme-gated here so vendor-three
// (~200 KB gz) never downloads unless the matching theme is active. Each
// component also self-gates on theme, so a mismatch renders nothing.
const CosmicBackground = React.lazy(() =>
  import("@/components/app/CosmicBackground").then(m => ({ default: m.CosmicBackground }))
);
const HazyNightsBackground = React.lazy(() =>
  import("@/components/app/HazyNightsBackground").then(m => ({ default: m.HazyNightsBackground }))
);
const SwarmsBackground = React.lazy(() =>
  import("@/components/app/SwarmsBackground").then(m => ({ default: m.SwarmsBackground }))
);
const WinterSnow = React.lazy(() =>
  import("@/components/app/WinterSnow").then(m => ({ default: m.WinterSnow }))
);
const LavaLampBackground = React.lazy(() =>
  import("@/components/app/LavaLampBackground").then(m => ({ default: m.LavaLampBackground }))
);

function ThemedBackgrounds() {
  const { theme } = useAppTheme();
  // Self-gating: only a canvas theme mounts a background. It renders on ALL
  // routes including /docs and /guides — the docs surface goes transparent and
  // wraps its content in liquid glass over the canvas (see docs-glass.css). The
  // canvas is z-index:0 and .docs-root establishes a z-index:1 stacking context
  // (docs-dark.css), so docs content composites above it and stays readable.
  return (
    <Suspense fallback={null}>
      {theme === "cosmic" && <CosmicBackground />}
      {theme === "hazy" && <HazyNightsBackground />}
      {theme === "swarms" && <SwarmsBackground />}
      {theme === "winter" && <WinterSnow />}
      {theme === "lavalamp" && <LavaLampBackground />}
    </Suspense>
  );
}


// Pages — lazy loaded
const DeleteAccount = React.lazy(() => import("./pages/DeleteAccount"));
const CreatorsPage = React.lazy(() => import("./pages/app/CreatorsPage"));
const SkillPage = React.lazy(() => import("./pages/SkillPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const AdminLoginPage = React.lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminUsersPage = React.lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminAdsPage = React.lazy(() => import("./pages/admin/AdminAdsPage"));
const AdminRoute = React.lazy(() =>
  import("./components/admin/AdminRoute").then((m) => ({ default: m.AdminRoute }))
);
// One persistent docs/blog surface for both /docs/* and the canonical
// /guides/<slug> blog posts — providers + sidebar mount ONCE and stay mounted
// across the /docs ↔ /guides boundary (see DocsSurface + the shared parent
// route below), so clicking on and off a blog post never remounts the panels.
const DocsSurface = React.lazy(() => import("./pages/DocsSurface"));
const ProfilePage = React.lazy(() => import("./pages/app/ProfilePage"));
const PostInfoPage = React.lazy(() => import("./pages/app/PostInfoPage"));
const SinglePostPage = React.lazy(() => import("./pages/app/SinglePostPage"));
const GovernanceProposalPage = React.lazy(() => import("./pages/app/GovernanceProposalPage"));
const BuilderPage = React.lazy(() => import("./pages/app/BuilderPage"));
const BuilderPreviewPage = React.lazy(() => import("./pages/app/BuilderPreviewPage"));
const StageDeepLinkPage = React.lazy(() => import("./pages/app/StageDeepLinkPage"));
const MobilePreview = React.lazy(() => import("./pages/MobilePreview"));
const GuidePage = React.lazy(() => import("./pages/GuidePage"));
const BestDecentralizedSocialMedia = React.lazy(() => import("./pages/BestDecentralizedSocialMedia"));
const BestWeb3SocialMediaDapps = React.lazy(() => import("./pages/BestWeb3SocialMediaDapps"));
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
const CreatorEditorHost = React.lazy(() => import("./pages/CreatorEditorHost"));
// Eager import — the referral lander is a new user's first touch of DeHub and
// must paint instantly; it renders outside WalletProviders (see App below) so
// it never waits on the ~1.5 MB wallet chunk either.
import ReferralLanding from "./pages/ReferralLanding";
const PremiumPage = React.lazy(() => import("./pages/Premium"));
const PricingPage = React.lazy(() => import("./pages/PricingPage"));
const ConnectPage = React.lazy(() => import("./pages/ConnectPage"));
const ConnectChatGPTPage = React.lazy(() => import("./pages/ConnectChatGPTPage"));
const ConnectClaudePage = React.lazy(() => import("./pages/ConnectClaudePage"));



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

// Rehydrate the persisted feed/profile slice BEFORE the boot prefetch below, so
// a reload / return visit paints last-known content instantly (esp. on slow
// connections) while fresh data loads behind it. Restored entries are stale, so
// they refetch automatically. See lib/query-persist.ts.
restoreQueryCache(queryClient);
startQueryPersist(queryClient);

// Warm the default home-feed cache at boot: the /api/feed request runs while
// the wallet chunk is still downloading, so content is ready when HomeFeed
// mounts. Cold loads always use the default filters (they persist in
// sessionStorage, which is empty on a fresh visit), so this key matches the
// one HomeFeed computes. A mismatch (user landed mid-session with custom
// filters) is harmless — the entry just idles in cache until gcTime.
if (typeof window !== "undefined") {
  const bootPath = window.location.pathname;
  if (bootPath === "/" || bootPath === "/app" || bootPath === "/app/") {
    prefetchUnifiedFeed(queryClient, {
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
      status: "minted",
    }).catch(() => {});
  }
}

/**
 * Authenticated app shell — everything that needs WalletProviders / AuthProvider.
 * Only mounted after user has passed the hero (or is a returning user).
 */
function AppContent() {
  const { isLoginModalOpen, closeLoginModal, user, walletAddress, isConnecting, isProcessingRedirect } = useAuth();
  usePreloadIcons();

  // LoginModal mounts on first open and stays mounted afterwards so its
  // close animation isn't cut short. Preload its chunk on idle so the first
  // open doesn't wait on the network.
  const [loginModalMounted, setLoginModalMounted] = useState(false);
  useEffect(() => {
    if (isLoginModalOpen) setLoginModalMounted(true);
  }, [isLoginModalOpen]);
  useEffect(() => {
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window ? requestIdleCallback(cb) : setTimeout(cb, 2000);
    idle(() => import("@/components/app/LoginModal").catch(() => {}));
  }, []);

  // While the login flow is active (modal open, or a connect/redirect in
  // flight just after it closes), center toasts in the middle app panel —
  // matching the login drawer's position — instead of the full viewport.
  // See --app-main-center-x, measured in AppLayout, and the matching
  // [data-login-active] rule in index.css.
  useEffect(() => {
    const active = isLoginModalOpen || isConnecting || isProcessingRedirect;
    document.documentElement.toggleAttribute('data-login-active', active);
  }, [isLoginModalOpen, isConnecting, isProcessingRedirect]);

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
      {loginModalMounted && (
        <Suspense fallback={null}>
          <LoginModal open={isLoginModalOpen} onOpenChange={closeLoginModal} />
        </Suspense>
      )}
      <Suspense fallback={<PageLoader />}>
        <SurfaceTransition>
          {(loc) => (
        <Routes location={loc}>
          <Route path="/mobile-preview" element={<MobilePreview />} />
          <Route path="/guide" element={<GuidePage />} />
          {/* Hand-built static guide pages — higher route rank than the
              /guides/* splat below, so they always win. */}
          <Route path="/guides/best-decentralized-social-media" element={<Suspense fallback={<PageLoader />}><BestDecentralizedSocialMedia /></Suspense>} />
          <Route path="/guides/best-web3-social-media-dapps" element={<Suspense fallback={<PageLoader />}><BestWeb3SocialMediaDapps /></Suspense>} />

          {/* Unified docs/blog surface. This pathless parent stays mounted for
              ALL of /docs, /docs/*, and /guides/<slug> (blog) — so crossing the
              /docs ↔ /guides boundary (e.g. blog list → post) swaps only the
              reading column, never the providers or the sidebar. DocsSurface
              self-routes internally; the children below are match anchors only.
              Inner Suspense fallback={null} keeps SurfaceTransition mounted on a
              cold docs-chunk load (the persistent background shows through). */}
          <Route element={<ErrorBoundary compact label="Docs"><Suspense fallback={null}><DocsSurface /></Suspense></ErrorBoundary>}>
            <Route path="/docs" element={null} />
            <Route path="/docs/*" element={null} />
            <Route path="/guides/*" element={null} />
          </Route>

          {/* Builder — its own full-page surface like docs: mounted OUTSIDE
              AppLayout so no app chrome renders, and getSurface('/app/builder')
              plays the same panel slide-off when entering/leaving. */}
          <Route
            path="/app/builder"
            element={
              <ErrorBoundary compact label="Builder">
                <Suspense fallback={null}>
                  <BuilderPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          {/* Public, auth-free renderer for a built app — the shareable link. */}
          <Route
            path="/app/builder/preview/:id"
            element={
              <ErrorBoundary compact label="Builder preview">
                <Suspense fallback={null}>
                  <BuilderPreviewPage />
                </Suspense>
              </ErrorBoundary>
            }
          />

          <Route path="/delete-account" element={<DeleteAccount />} />

          {/* Admin panel — email/password auth, separate from user wallet session */}
          <Route path="/admin/login" element={<Suspense fallback={<PageLoader />}><AdminLoginPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<PageLoader />}><AdminRoute /></Suspense>}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsersPage /></Suspense>} />
            <Route path="ads" element={<Suspense fallback={<PageLoader />}><AdminAdsPage /></Suspense>} />
          </Route>

          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/skill.md" element={<SkillPage />} />
          <Route path="/editor" element={<Suspense fallback={<PageLoader />}><CreatorEditorHost /></Suspense>} />
          <Route path="/creator" element={<Suspense fallback={<PageLoader />}><CreatorEditorHost /></Suspense>} />
          {/* /r/:code renders in the top-level Routes (outside WalletProviders) — see App below */}
          <Route path="/prompt" element={<Suspense fallback={<PageLoader />}><PromptLanding /></Suspense>} />
          <Route path="/premium" element={<Suspense fallback={<PageLoader />}><PremiumPage /></Suspense>} />
          <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><PricingPage /></Suspense>} />
          <Route path="/connect" element={<Suspense fallback={<PageLoader />}><ConnectPage /></Suspense>} />
          <Route path="/connect/chatgpt" element={<Suspense fallback={<PageLoader />}><ConnectChatGPTPage /></Suspense>} />
          <Route path="/connect/claude" element={<Suspense fallback={<PageLoader />}><ConnectClaudePage /></Suspense>} />
          <Route path="/mcp" element={<Navigate to="/connect" replace />} />



          {/* Single shared AppLayout — header/sidebar mount ONCE and persist across all app routes */}
          <Route element={<AppLayout />}>
            <Route path="/jobs" element={null} />
            <Route path="/features" element={null} />
            <Route path="/governance" element={null} />
            <Route path="/stake" element={null} />
            <Route path="/communities" element={null} />
            <Route path="/communities/:slug" element={<Suspense fallback={<PageLoader />}><CommunityPage /></Suspense>} />

            {/* dehub.io root IS the home feed — rendered in place, no redirect.
                Same cached HomePage as /app (see PersistentPageCache home paths). */}
            <Route path="/" element={null} />

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
              <Route path="stages" element={null} />
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
              <Route path="ads" element={null} />
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

            {/* Clean, indexable section URLs (SEO sitelink targets). /explore
                renders the Explore page; /videos and /shorts open the home feed
                on the matching tab. All are managed by PersistentPageCache and
                must sit BEFORE /:username so they aren't caught as profiles. */}
            <Route path="/explore" element={null} />
            <Route path="/stages" element={null} />
            <Route path="/videos" element={null} />
            <Route path="/shorts" element={null} />

            {/* Username profiles — inside shared layout so header never remounts */}
            <Route path="/:username" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
          )}
        </SurfaceTransition>
      </Suspense>
    </>
  );
}

// Shown while the wallet chunk loads. On home/app routes, paint the real
// shell skeleton immediately instead of a black screen; other routes (docs,
// marketing pages) keep the plain boot shell to avoid a misleading flash.
const WalletLoader = () => {
  const path = window.location.pathname;
  const isAppShellRoute = path === "/" || path === "/app" || path.startsWith("/app/");
  if (isAppShellRoute) return <HomeShellSkeleton />;
  // Docs/blog readers (SEO landings) used to get a BLANK page here while the
  // wallet chunk loaded. Give them a neutral reading-page skeleton — plain
  // divs only, theme-agnostic greys that read fine on light or dark.
  if (path.startsWith("/docs") || path.startsWith("/guides")) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 animate-pulse" aria-hidden="true">
        <div className="h-8 w-2/3 rounded bg-zinc-500/20 mb-6" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-zinc-500/15" />
          <div className="h-4 w-11/12 rounded bg-zinc-500/15" />
          <div className="h-4 w-4/5 rounded bg-zinc-500/15" />
          <div className="h-4 w-full rounded bg-zinc-500/15" />
          <div className="h-4 w-3/4 rounded bg-zinc-500/15" />
        </div>
      </div>
    );
  }
  return null;
};

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
           * dehub.io has no separate landing page — `/` is the app home. The
           * old 3D "nebula" lander (Welcome To Our World hero + app-store
           * download buttons) was archived on 2026-07-14; recover it from git
           * history at 27c5f2890 (src/pages/Index.tsx + src/components/hero/*
           * + src/components/ui/futuristic-alien-hero.tsx) if ever needed.
           *
           * All routes (including `/`) go through WalletProviders; the redirect
           * from `/` to `/app` happens inside AppContent's <Routes>.
           */}
          <Routes>
            {/*
             * Referral lander — a new user's first touch of DeHub. Mounted
             * OUTSIDE WalletProviders (it uses no auth/wallet state) so it
             * paints without waiting for the ~1.5 MB wallet chunk.
             */}
            <Route path="/r/:code" element={<ReferralLanding />} />
            <Route
              path="*"
              element={
                <Suspense fallback={<WalletLoader />}>
                  <WalletProviders>
                    <UserPreferencesProvider>
                    <ThemeProvider>
                      <OptimisticPostsProvider>
                        <TooltipProvider>
                          {/* The animated canvas is purely decorative — a WebGL
                              context loss or GPU throw here must NEVER take down
                              the app (it used to, via the single root boundary).
                              Fail silent: worst case you lose the background. */}
                          <ErrorBoundary fallback={null}>
                            <ThemedBackgrounds />
                          </ErrorBoundary>

                          <AppContent />
                        </TooltipProvider>
                      </OptimisticPostsProvider>
                    </ThemeProvider>
                    </UserPreferencesProvider>
                  </WalletProviders>
                </Suspense>
              }
            />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </HelmetProvider>
);

export default App;
