import { Toaster as Sonner } from "@/components/ui/sonner";
import { NewVersionToast } from "@/components/app/NewVersionToast";
import { NotificationsPromptToast } from "@/components/app/NotificationsPromptToast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NativeTitleTooltips } from "@/components/app/NativeTitleTooltips";
import { MutationCache, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthenticationError } from "@/lib/api/dehub";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { OptimisticPostsProvider } from "@/hooks/use-optimistic-posts";
// Direct import (not the modals barrel) so the barrel's other modals stay out
// of the entry bundle.
import { UsernameRequiredModal } from "@/components/app/modals/UsernameRequiredModal";
import { GiveawayPrizeModal } from "@/components/app/GiveawayPrizeModal";
import { SelfBadgeSync } from "@/components/app/SelfBadgeSync";
import { ViewingPreferencesSync } from "@/components/app/ViewingPreferencesSync";
import { useAuth } from "@/contexts/AuthContext";
import { usePreloadIcons } from "@/hooks/use-preload-icons";
import { prefetchUnifiedFeed } from "@/hooks/use-unified-feed";
import { restoreQueryCache, startQueryPersist } from "@/lib/query-persist";
import { AppLayout } from "./components/app/AppLayout";
import { LoginModal, prefetchLoginModal } from "@/components/app/LoginModal";
import React, { Suspense, useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18nInstance from "@/i18n";
import { HelmetProvider } from "react-helmet-async";
import { SEOHead } from "@/components/SEOHead";
import { HomeShellSkeleton } from "@/components/app/PageSkeletons";
import { DeHubPageLoader } from "@/components/app/DeHubLoader";
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

// Login modal — imported eagerly, and deliberately so. The sheet has to be on
// screen the instant "Log in" is tapped, which it cannot be if a chunk has to
// arrive and evaluate first. Only the shell is here: LoginModal itself holds
// the Suspense boundary for its contents, and wagmi / RainbowKit / the wallet
// steps all stay behind it, on the wallet-side chunks where the guardrails in
// scripts/check-entry-bundle.mjs expect them.

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
const WarBackground = React.lazy(() =>
  import("@/components/app/WarBackground").then(m => ({ default: m.WarBackground }))
);
// The War boot sequence is its own chunk from the background: it renders once
// per session and must not keep the terrain scene's code in memory afterwards.
const WarPreloader = React.lazy(() =>
  import("@/components/app/WarPreloader").then(m => ({ default: m.WarPreloader }))
);
const WarGameLauncher = React.lazy(() =>
  import("@/components/app/war/WarGameLauncher").then(m => ({ default: m.WarGameLauncher }))
);
const OsakaBackground = React.lazy(() =>
  import("@/components/app/OsakaBackground").then(m => ({ default: m.OsakaBackground }))
);
// Jungle is the one canvas theme that does NOT pull vendor-three: it is a single
// full-screen shader written against raw WebGL, so this ~15 KB chunk is the
// whole theme. See the header of JungleBackground.tsx for why.
const JungleBackground = React.lazy(() =>
  import("@/components/app/JungleBackground").then(m => ({ default: m.JungleBackground }))
);
// Its own chunk, like War's: the launcher is only reachable by an explicit
// opt-in and must not keep the game's iframe plumbing in the theme's payload.
const JungleGameLauncher = React.lazy(() =>
  import("@/components/app/jungle/JungleGameLauncher").then(m => ({ default: m.JungleGameLauncher }))
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
      {theme === "war" && <WarBackground />}
      {theme === "war" && <WarPreloader />}
      {theme === "war" && <WarGameLauncher />}
      {theme === "osaka" && <OsakaBackground />}
      {theme === "jungle" && <JungleBackground />}
      {theme === "jungle" && <JungleGameLauncher />}
    </Suspense>
  );
}


// Pages — lazy loaded
const DeleteAccount = React.lazy(() => import("./pages/DeleteAccount"));
const AuthConfirm = React.lazy(() => import("./pages/AuthConfirm"));
const CreatorsPage = React.lazy(() => import("./pages/app/CreatorsPage"));
const SkillPage = React.lazy(() => import("./pages/SkillPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
// One persistent docs/blog surface for both /docs/* and the canonical
// /guides/<slug> blog posts — providers + sidebar mount ONCE and stay mounted
// across the /docs ↔ /guides boundary (see DocsSurface + the shared parent
// route below), so clicking on and off a blog post never remounts the panels.
const DocsSurface = React.lazy(() => import("./pages/DocsSurface"));
const ProfilePage = React.lazy(() => import("./pages/app/ProfilePage"));
const PostInfoPage = React.lazy(() => import("./pages/app/PostInfoPage"));
const SinglePostPage = React.lazy(() => import("./pages/app/SinglePostPage"));
const NewPostPage = React.lazy(() => import("./pages/app/NewPostPage"));
const UploadPage = React.lazy(() => import("./pages/app/UploadPage"));
const GovernanceProposalPage = React.lazy(() => import("./pages/app/GovernanceProposalPage"));
const BuilderPage = React.lazy(() => import("./pages/app/BuilderPage"));
const BuilderPreviewPage = React.lazy(() => import("./pages/app/BuilderPreviewPage"));
const PairTestPage = React.lazy(() => import("./pages/app/PairTestPage"));
const StageDeepLinkPage = React.lazy(() => import("./pages/app/StageDeepLinkPage"));
const MobilePreview = React.lazy(() => import("./pages/MobilePreview"));
const GuidePage = React.lazy(() => import("./pages/GuidePage"));
const BestDecentralizedSocialMedia = React.lazy(() => import("./pages/BestDecentralizedSocialMedia"));
const BestWeb3SocialMediaDapps = React.lazy(() => import("./pages/BestWeb3SocialMediaDapps"));
const PromptLanding = React.lazy(() => import("./pages/PromptLanding"));
const CommunityPage = React.lazy(() => import("./pages/app/CommunityPage"));
const CommunityInvitePage = React.lazy(() => import("./pages/app/CommunityInvitePage"));
const EventPage = React.lazy(() => import("./pages/EventPage"));
const StoreDetailPage = React.lazy(() => import("./pages/app/StoreDetailPage"));
const LaunchpadPage = React.lazy(() => import("./pages/app/LaunchpadPage"));
const LaunchpadCreatePage = React.lazy(() => import("./pages/app/LaunchpadCreatePage"));
const LaunchpadCoinPage = React.lazy(() => import("./pages/app/LaunchpadCoinPage"));
const WorkPostPage = React.lazy(() => import("./pages/app/WorkPostPage"));
const SuperPowersPage = React.lazy(() => import("./pages/app/SuperPowersPage"));
const WorkJobDetailPage = React.lazy(() => import("./pages/app/WorkJobDetailPage"));
const WorkEditPage = React.lazy(() => import("./pages/app/WorkEditPage"));
const WorkDisputesPage = React.lazy(() => import("./pages/app/WorkDisputesPage"));
const CreatorEditorHost = React.lazy(() => import("./pages/CreatorEditorHost"));
// Eager import — the referral lander is a new user's first touch of DeHub and
// must paint instantly; it renders outside WalletProviders (see App below) so
// it never waits on the ~1.5 MB wallet chunk either.
import ReferralLanding from "./pages/ReferralLanding";
const PremiumPage = React.lazy(() => import("./pages/Premium"));
const PricingPage = React.lazy(() => import("./pages/PricingPage"));
const DePinPage = React.lazy(() => import("./pages/DePinPage"));
const CinemaPage = React.lazy(() => import("./pages/CinemaPage"));
const RafflePage = React.lazy(() => import("./pages/RafflePage"));
const ConnectPage = React.lazy(() => import("./pages/ConnectPage"));
const ConnectChatGPTPage = React.lazy(() => import("./pages/ConnectChatGPTPage"));
const ConnectClaudePage = React.lazy(() => import("./pages/ConnectClaudePage"));
const ApkPage = React.lazy(() => import("./pages/ApkPage"));
// The arcade player is a standalone full-viewport surface (no AppLayout): the
// games take the whole window and two of them take the pointer, so the header
// and sidebars would be in the way rather than useful. Its own chunk, like the
// theme launchers', so the iframe plumbing never rides along in a page bundle.
const ArcadeGamePage = React.lazy(() => import("./pages/ArcadeGamePage"));
const ArcadeChessOnlinePage = React.lazy(() => import("./pages/ArcadeChessOnlinePage"));



// Route-chunk fallback. Was `null`, which meant a slow chunk (cold cache, bad
// connection) showed a blank page for as long as it took. The DeHub mark fades
// in on a 250 ms delay (see .dehub-loader-mark in index.css), so a fast chunk
// still shows no loading stage — the original reason this was empty.
const PageLoader = () => <DeHubPageLoader fullScreen />;

/**
 * Builder lived at /app/builder until it took the top-level /builder URL.
 * Direct hits are 301'd at the edge (SPA_REDIRECTS + the preview rule in
 * CLOUDFLARE_WORKER_SEO.js); this covers in-app navigation and every
 * already-shared /app/builder/preview/<id> link that lands client-side.
 */
function LegacyBuilderRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace('/app/builder', '/builder')}${search}${hash}`} replace />;
}

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
  // Every write in the app funnels through a mutation, but only a handful of
  // call sites ever checked for AuthenticationError. Everywhere else an
  // expired session surfaced as a generic red toast in whichever component
  // happened to catch it, leaving "sign out and back in" as the only fix the
  // user could discover. This is the one place that catches all of them.
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error instanceof AuthenticationError) {
        // Dispatched rather than handled here: this runs outside React, so it
        // cannot touch auth context directly. AuthProvider listens.
        window.dispatchEvent(new CustomEvent('dehub:auth-expired'));
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Retrying an auth failure just burns a round trip — apiCall has already
      // tried to refresh by the time it throws AuthenticationError.
      retry: (failureCount, error) =>
        !(error instanceof AuthenticationError) && failureCount < 1,
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
      status: "all",
    }).catch(() => {});
  }
}

/**
 * Authenticated app shell — everything that needs WalletProviders / AuthProvider.
 * Only mounted after user has passed the hero (or is a returning user).
 */
function AppContent() {
  const { isLoginModalOpen, closeLoginModal, user, walletAddress, isConnecting, isProcessingRedirect } = useAuth();
  const queryClient = useQueryClient();
  usePreloadIcons();

  // Warm the sheet's contents so the skeleton inside it stays theoretical. The
  // timeout matters: a feed that never goes idle used to starve this
  // altogether, which is precisely when a cold first open hurts most.
  useEffect(() => {
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window
        ? requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 1500);
    idle(() => prefetchLoginModal());
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

  // Starter + daily free AI credit — claimed server-side, idempotent per UTC
  // day, so firing on every sign-in is safe. On a grant, refresh the balance
  // query so a mounted credit surface agrees with the toast.
  useEffect(() => {
    if (!wallet) return;
    import("@/lib/ai-credit-claim")
      .then(m => m.claimDailyAiCredit(() => {
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
      }))
      .catch(() => undefined);
  }, [wallet, queryClient]);

  return (
    <>
      <SelfBadgeSync />
      <ViewingPreferencesSync />
      <UsernameRequiredModal />
      <GiveawayPrizeModal />
      {/* Always mounted, and closed it costs nothing: ui/drawer keeps vaul's
          Root out of the tree until a sheet first opens, so this renders no
          DOM and registers no listeners until someone taps "Log in". Mounting
          it up front is what buys the slide-up — a vaul Root created with
          `open` already true renders at its final position with no transition,
          which is why the sheet used to appear rather than come up. */}
      <LoginModal open={isLoginModalOpen} onOpenChange={closeLoginModal} />
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
              AppLayout so no app chrome renders, and getSurface('/builder')
              plays the same panel slide-off when entering/leaving.
              Top-level /builder is the canonical URL. `builder` is reserved in
              src/lib/reserved-usernames.js, so the /:username route below can
              never claim it — without that, the first person to register the
              handle owns this URL and the page becomes unreachable. */}
          <Route
            path="/builder"
            element={
              <ErrorBoundary compact label="Builder">
                <Suspense fallback={<PageLoader />}>
                  <BuilderPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          {/* Public, auth-free renderer for a built app — the shareable link. */}
          <Route
            path="/builder/preview/:id"
            element={
              <ErrorBoundary compact label="Builder preview">
                <Suspense fallback={<PageLoader />}>
                  <BuilderPreviewPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          {/* Links minted while Builder lived under /app. Kept so every already
              shared preview link keeps resolving; the edge 301s direct hits. */}
          <Route path="/app/builder/*" element={<LegacyBuilderRedirect />} />

          {/* Random pairing connection test. Unlisted on purpose — no nav entry
              and no app chrome; it exists to prove matchmaking and the WebRTC
              path before any camera code lands. */}
          <Route
            path="/app/pair"
            element={
              <ErrorBoundary compact label="Pair test">
                <Suspense fallback={<PageLoader />}>
                  <PairTestPage />
                </Suspense>
              </ErrorBoundary>
            }
          />

          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/auth/confirm" element={<Suspense fallback={<PageLoader />}><AuthConfirm /></Suspense>} />

          {/*
            /admin used to live here — a second admin frontend on the public
            site, sharing the real admin API token behind a route guard whose
            entire body was "does a token exist". No role check, no verification.
            Every page it carried is now on godmode.dehub.io, including the ads
            review queue, which moved there last because it was the only one
            without an equivalent. Nothing links here and nothing should.
          */}

          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/skill.md" element={<SkillPage />} />
          <Route path="/editor" element={<Suspense fallback={<PageLoader />}><CreatorEditorHost /></Suspense>} />
          <Route path="/creator" element={<Suspense fallback={<PageLoader />}><CreatorEditorHost /></Suspense>} />
          {/* /r/:code renders in the top-level Routes (outside WalletProviders) — see App below */}
          <Route path="/prompt" element={<Suspense fallback={<PageLoader />}><PromptLanding /></Suspense>} />
          <Route path="/premium" element={<Suspense fallback={<PageLoader />}><PremiumPage /></Suspense>} />
          <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><PricingPage /></Suspense>} />
          <Route path="/depin" element={<Suspense fallback={<PageLoader />}><DePinPage /></Suspense>} />
          {/* Prize draws. dehub.net/prize-draw and raffle.dehub.net both 301
              here (CLOUDFLARE_WORKER_SEO.js), so this route is the landing for
              every legacy raffle URL the old domain still holds in the index. */}
          <Route path="/raffle" element={<Suspense fallback={<PageLoader />}><RafflePage /></Suspense>} />
          <Route path="/connect" element={<Suspense fallback={<PageLoader />}><ConnectPage /></Suspense>} />
          <Route path="/connect/chatgpt" element={<Suspense fallback={<PageLoader />}><ConnectChatGPTPage /></Suspense>} />
          <Route path="/connect/claude" element={<Suspense fallback={<PageLoader />}><ConnectClaudePage /></Suspense>} />
          <Route path="/mcp" element={<Navigate to="/connect" replace />} />

          {/* Direct APK download lander. Standalone (no AppLayout) — it is a
              single non-scrolling screen that owns the viewport, and it is
              reached from outside the app far more often than from inside it. */}
          <Route path="/apk" element={<Suspense fallback={<PageLoader />}><ApkPage /></Suspense>} />

          {/* Arcade player. Two segments, so it outranks the /:username
              catch-all inside AppLayout below and never has to be ordered
              against it — but it lives out here rather than in the layout
              because the game owns the viewport. The /arcade grid itself DOES
              sit in the layout (see the cached pages below). */}
          <Route path="/arcade/:slug" element={<Suspense fallback={<PageLoader />}><ArcadeGamePage /></Suspense>} />

          {/* Online chess: the King's Gambit lobby and live board. Standalone
              for the same reason as the player above — a live match owns the
              viewport — and three segments, so it needs no ordering against
              /arcade/:slug either. */}
          <Route path="/arcade/kings-gambit/online" element={<Suspense fallback={<PageLoader />}><ArcadeChessOnlinePage /></Suspense>} />



          {/* Single shared AppLayout — header/sidebar mount ONCE and persist across all app routes */}
          <Route element={<AppLayout />}>
            <Route path="/jobs" element={null} />
            <Route path="/stats" element={null} />
            <Route path="/features" element={null} />
            <Route path="/governance" element={null} />
            <Route path="/stake" element={null} />
            <Route path="/communities" element={null} />
            <Route path="/communities/join/:code" element={<Suspense fallback={<PageLoader />}><CommunityInvitePage /></Suspense>} />
            <Route path="/communities/:slug" element={<Suspense fallback={<PageLoader />}><CommunityPage /></Suspense>} />

            {/* Cinema sits INSIDE the layout, unlike the marketing pages it
                shipped beside. It shares to the feed and it collects reviews,
                so it needs the app's provider stack — ShareEntityDrawer calls
                useGlobalDropZone, which only exists under AppLayout, and it is
                AppLayout that renders the composer that "share to feed" opens.
                Standalone, opening a title threw straight to the error
                boundary. */}
            <Route path="/cinema" element={<Suspense fallback={<PageLoader />}><CinemaPage /></Suspense>} />
            {/* One title. Same page — the open film is URL state so it can be
                shared, carded and indexed; see the note in CinemaPage. */}
            <Route path="/cinema/:filmType/:filmId" element={<Suspense fallback={<PageLoader />}><CinemaPage /></Suspense>} />

            {/* dehub.io root IS the home feed — rendered in place, no redirect.
                Same cached HomePage as /app (see PersistentPageCache home paths). */}
            <Route path="/" element={null} />

            {/* App routes — cached pages render null, PersistentPageCache manages them */}
            <Route path="/app">
              <Route index element={null} />
              <Route path="affiliate" element={null} />
              <Route path="arcade" element={null} />
              
              <Route path="explore" element={null} />
              <Route path="profile" element={null} />
              {/* The composer as a page, so it has an address to frame — see pages/app/UploadPage. */}
              <Route path="upload" element={<Suspense fallback={null}><UploadPage /></Suspense>} />
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
              <Route path="superpowers" element={<Suspense fallback={<PageLoader />}><SuperPowersPage /></Suspense>} />
              <Route path="bridge" element={null} />
              <Route path="top-100" element={null} />
              <Route path="jobs" element={null} />
              <Route path="glossary" element={null} />
              <Route path="stats" element={null} />
              <Route path="events" element={null} />
              <Route path="events/:eventNumber" element={<Suspense fallback={<PageLoader />}><EventPage /></Suspense>} />
              <Route path="communities" element={null} />
              <Route path="fractions" element={null} />
              <Route path="stores" element={null} />
              <Route path="stores/:storeId" element={<Suspense fallback={<PageLoader />}><StoreDetailPage /></Suspense>} />
              <Route path="usernames" element={null} />
              <Route path="accounts" element={null} />
              <Route path="ads" element={null} />
              <Route path="work" element={null} />
              <Route path="work/post" element={<Suspense fallback={<PageLoader />}><WorkPostPage /></Suspense>} />
              <Route path="work/disputes" element={<Suspense fallback={<PageLoader />}><WorkDisputesPage /></Suspense>} />
              <Route path="work/:jobId" element={<Suspense fallback={<PageLoader />}><WorkJobDetailPage /></Suspense>} />
              <Route path="work/:jobId/edit" element={<Suspense fallback={<PageLoader />}><WorkEditPage /></Suspense>} />

              <Route path="communities/join/:code" element={<Suspense fallback={<PageLoader />}><CommunityInvitePage /></Suspense>} />
              <Route path="communities/:slug" element={<Suspense fallback={<PageLoader />}><CommunityPage /></Suspense>} />
              <Route path="post/:postId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
              <Route path="video/:tokenId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
              <Route path="newpost/:n" element={<Suspense fallback={<PageLoader />}><NewPostPage /></Suspense>} />
              <Route path="post/:postId/info" element={<Suspense fallback={<PageLoader />}><PostInfoPage /></Suspense>} />
              {/* Launchpad — hidden, no nav links, reachable by URL only */}
              <Route path="launchpad" element={<Suspense fallback={<PageLoader />}><LaunchpadPage /></Suspense>}>
                <Route path="create" element={<Suspense fallback={<PageLoader />}><LaunchpadCreatePage /></Suspense>} />
              </Route>
              <Route path="launchpad/:mintId" element={<Suspense fallback={<PageLoader />}><LaunchpadCoinPage /></Suspense>} />
            </Route>

            {/* /work aliases */}
            <Route path="/work" element={null} />
            <Route path="/work/post" element={<Suspense fallback={<PageLoader />}><WorkPostPage /></Suspense>} />
            <Route path="/work/disputes" element={<Suspense fallback={<PageLoader />}><WorkDisputesPage /></Suspense>} />
            <Route path="/work/:jobId" element={<Suspense fallback={<PageLoader />}><WorkJobDetailPage /></Suspense>} />
            <Route path="/work/:jobId/edit" element={<Suspense fallback={<PageLoader />}><WorkEditPage /></Suspense>} />

            {/* /affiliate alias (page itself is rendered by PersistentPageCache) */}
            <Route path="/affiliate" element={null} />

            {/* /usernames alias — the canonical form the worker links and
                sitemaps, so the SPA has to answer it too. */}
            <Route path="/usernames" element={null} />

            {/* /accounts alias — same shape as /usernames above. */}
            <Route path="/accounts" element={null} />


            {/* Stage invite links. /stages/:id is the short numeric share form
                (audio_spaces.short_id); the exact /stages path below still opens
                the hub page — a param segment never matches the bare route. */}
            <Route path="/stage/:id" element={<Suspense fallback={<PageLoader />}><StageDeepLinkPage /></Suspense>} />
            <Route path="/stages/:id" element={<Suspense fallback={<PageLoader />}><StageDeepLinkPage /></Suspense>} />
            {/* An off-chain post's own URL — the canonical share form is top-level. */}
            <Route path="/newpost/:n" element={<Suspense fallback={<PageLoader />}><NewPostPage /></Suspense>} />

            {/* Short post URLs, mirroring /stages/:n. /posts/1 opens the post;
                /b hangs the author's own straight comments off it as a thread
                (X-style), and /posts/1/b/<commentId> deep-links one entry. */}
            <Route path="/posts/:postId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
            <Route path="/posts/:postId/b" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
            <Route path="/posts/:postId/b/:commentId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />

            {/* Launchpad — public URL alias (hidden, no nav links) */}
            <Route path="/launchpad" element={<Suspense fallback={<PageLoader />}><LaunchpadPage /></Suspense>}>
              <Route path="create" element={<Suspense fallback={<PageLoader />}><LaunchpadCreatePage /></Suspense>} />
            </Route>
            <Route path="/launchpad/:mintId" element={<Suspense fallback={<PageLoader />}><LaunchpadCoinPage /></Suspense>} />

            {/* Clean, indexable section URLs (SEO sitelink targets). /explore
                renders the Explore page; /videos and /shorts open the home feed
                on the matching tab. All are managed by PersistentPageCache and
                must sit BEFORE /:username so they aren't caught as profiles.
                The bare forms below exist because the SEO worker canonicalizes
                /app/<section> to /<section> and links the bare URLs in bot HTML
                and the sitemap — without a matching SPA route, a human clicking
                a search result landed on the /:username catch-all (dehub.io/music
                rendered the empty profile of the user "@music"). */}
            <Route path="/explore" element={null} />
            {/* The arcade grid. Bare /arcade is the canonical URL the sitemap
                and the nav both point at; /app/arcade is the twin every other
                section has. Both are backed by one cached page. */}
            <Route path="/arcade" element={null} />
            <Route path="/stages" element={null} />
            <Route path="/videos" element={null} />
            <Route path="/shorts" element={null} />
            <Route path="/music" element={null} />
            <Route path="/tv" element={null} />
            <Route path="/bridge" element={null} />
            <Route path="/agents" element={null} />
            <Route path="/assistant" element={null} />
            <Route path="/top-100" element={null} />
            <Route path="/leaderboard" element={null} />
            <Route path="/events" element={null} />
            {/* Radio is a tab of the Music page, not its own page — but the
                worker advertises /radio to bots, so give humans a landing on
                the canonical bare form (not the /app twin). */}
            <Route path="/radio" element={<Navigate to="/music" replace />} />

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
  // Everything else (marketing/standalone routes) used to get a blank screen
  // for the whole wallet-chunk fetch.
  return <DeHubPageLoader fullScreen />;
};

/**
 * Last-resort boundary for anything the contained per-surface boundaries don't
 * cover — the providers, AppLayout's own chrome, and the standalone routes that
 * render outside it (/premium, /pricing, /connect, NotFound, …).
 *
 * It has to live INSIDE BrowserRouter for the resetKey: catching unmounts the
 * whole <Routes> subtree, so nothing below can navigate, and without a reset on
 * the route the only ways out were a hard refresh or the fallback's Go Home
 * button. With it, Back/Forward recovers too, and the boundary in main.tsx goes
 * back to being what it should be — the net for a failure during boot itself.
 */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}

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
          {/* Watches /version.json for a newer deploy; renders nothing itself. */}
          <NewVersionToast />
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
          <RouteErrorBoundary>
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

                          {/* Engagement-gated soft-ask for browser
                              notifications; renders nothing itself. Reads
                              auth, so it must stay inside WalletProviders. */}
                          <NotificationsPromptToast />

                          {/* Swaps the OS's grey `title=` tooltip for our own
                              hover label everywhere. Renders nothing itself. */}
                          <NativeTitleTooltips />

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
          </RouteErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  </HelmetProvider>
);

export default App;
