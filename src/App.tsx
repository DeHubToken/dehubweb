import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OptimisticPostsProvider } from "@/hooks/use-optimistic-posts";
import { UsernameRequiredModal } from "@/components/app/modals";
import { LoginModal } from "@/components/app/LoginModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePreloadIcons } from "@/hooks/use-preload-icons";
import { AppLayout } from "./components/app/AppLayout";
import React, { Suspense, useState, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18nInstance from "@/i18n";
import { HelmetProvider } from "react-helmet-async";
import { SEOHead } from "@/components/SEOHead";
import { StageProvider } from "@/contexts/StageContext";

// Pages — lazy loaded
const Index = React.lazy(() => import("./pages/Index"));
const DeleteAccount = React.lazy(() => import("./pages/DeleteAccount"));
const CreatorsPage = React.lazy(() => import("./pages/app/CreatorsPage"));
const JobsPage = React.lazy(() => import("./pages/JobsPage"));
const SkillPage = React.lazy(() => import("./pages/SkillPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const DocsPage = React.lazy(() => import("./pages/DocsPage"));
const ProfilePage = React.lazy(() => import("./pages/app/ProfilePage"));
const PostInfoPage = React.lazy(() => import("./pages/app/PostInfoPage"));
const SinglePostPage = React.lazy(() => import("./pages/app/SinglePostPage"));
const GovernanceProposalPage = React.lazy(() => import("./pages/app/GovernanceProposalPage"));
const StageDeepLinkPage = React.lazy(() => import("./pages/app/StageDeepLinkPage"));
const MobilePreview = React.lazy(() => import("./pages/MobilePreview"));
const GuidePage = React.lazy(() => import("./pages/GuidePage"));


// Preload critical dynamic-route chunks after initial render so first navigation is instant
const preloadCriticalChunks = () => {
  // Use requestIdleCallback (or setTimeout fallback) to avoid blocking initial render
  const schedule = typeof requestIdleCallback === 'function' ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 2000);
  schedule(() => {
    import("./pages/app/SinglePostPage");
    import("./pages/app/ProfilePage");
    import("./pages/app/PostInfoPage");
  });
};
// Fire once on module load — chunks will be cached by the bundler
if (typeof window !== 'undefined') {
  preloadCriticalChunks();
}

const PageLoader = () => (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="animate-pulse text-white/60 text-sm tracking-widest font-medium">DEHUB</div>
  </div>
);


/**
 * One-time cache migration for existing testers.
 * Clears stale auth/wagmi/web3auth data after auth flow changes.
 * Bump CURRENT_CACHE_VERSION to force another clear in the future.
 * Safe to remove this block once all testers have loaded the app at least once.
 */
const CURRENT_CACHE_VERSION = '2';
(function migrateStaleCacheOnce() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('dehub_cache_version') === CURRENT_CACHE_VERSION) return;

  console.log('[CacheMigration] Clearing stale data for version', CURRENT_CACHE_VERSION);

  // Clear DeHub auth state
  ['dehub_token', 'dehub_token_timestamp', 'dehub_wallet', 'dehub_user',
   'dehub_connection_source', 'dehub_deployed_sa'].forEach(k => localStorage.removeItem(k));

  // Clear wagmi / WalletConnect / Web3Auth keys
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
  console.log('[CacheMigration] Done. Cleared', keysToRemove.length + 6, 'keys');
})();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,     // 2 minutes - prevents refetching recently loaded data
      gcTime: 10 * 60 * 1000,       // 10 minutes - keeps cached data longer
      refetchOnWindowFocus: false,  // Prevents refetch when switching tabs
      retry: 1,
    },
  },
});

// Inner app component that uses auth context
function AppContent() {
  const { isLoginModalOpen, closeLoginModal } = useAuth();
  const [langVersion, setLangVersion] = useState(0);

  useEffect(() => {
    const handleLangChange = () => {
      setLangVersion(v => v + 1);
    };
    i18nInstance.on('languageChanged', handleLangChange);
    return () => { i18nInstance.off('languageChanged', handleLangChange); };
  }, []);

  // Preload 3D icons on app mount to prevent flicker during navigation
  usePreloadIcons();

  return (
    <div key={langVersion}>
      <SEOHead />
      <Sonner />
      <UsernameRequiredModal />
      <LoginModal open={isLoginModalOpen} onOpenChange={closeLoginModal} />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/mobile-preview" element={<MobilePreview />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/*" element={<DocsPage />} />
            
            <Route path="/delete-account" element={<DeleteAccount />} />
            
            <Route path="/creators" element={<CreatorsPage />} />
            <Route path="/skill.md" element={<SkillPage />} />

            {/* Single shared AppLayout — header/sidebar mount ONCE and persist across all app routes */}
            <Route element={<AppLayout />}>
              <Route path="/jobs" element={null} />
              <Route path="/features" element={null} />
              <Route path="/governance" element={null} />
              <Route path="/stake" element={null} />

              {/* App routes — cached pages render null, PersistentPageCache manages them */}
              <Route path="/app">
                <Route index element={null} />
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
                <Route path="post/:postId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
                <Route path="video/:tokenId" element={<Suspense fallback={<PageLoader />}><SinglePostPage /></Suspense>} />
                <Route path="post/:postId/info" element={<Suspense fallback={<PageLoader />}><PostInfoPage /></Suspense>} />
              </Route>

              {/* Stage invite links — /stage/:id joins the stage then redirects to /app */}
              <Route path="/stage/:id" element={<Suspense fallback={<PageLoader />}><StageDeepLinkPage /></Suspense>} />

              {/* Username profiles — inside shared layout so header never remounts */}
              <Route path="/:username" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
            </Route>


            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}

import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const App = () => (
  <HelmetProvider>
    <I18nextProvider i18n={i18nInstance}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider theme={darkTheme()} modalSize="compact">
            <AuthProvider>
              <StageProvider>
                <OptimisticPostsProvider>
                  <TooltipProvider>
                    <AppContent />
                  </TooltipProvider>
                </OptimisticPostsProvider>
              </StageProvider>
            </AuthProvider>
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </HelmetProvider>
);

export default App;
