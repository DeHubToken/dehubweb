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
import React, { Suspense } from "react";

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

const PageLoader = () => (
  <div className="min-h-screen bg-black" />
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
  
  // Preload 3D icons on app mount to prevent flicker during navigation
  usePreloadIcons();
  
  return (
    <>
      <Sonner />
      <UsernameRequiredModal />
      <LoginModal open={isLoginModalOpen} onOpenChange={closeLoginModal} />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/*" element={<DocsPage />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/creators" element={<CreatorsPage />} />
            <Route path="/jobs" element={<AppLayout />}>
              <Route index element={null} />
            </Route>
            <Route path="/skill.md" element={<SkillPage />} />
            <Route path="/features" element={<AppLayout />}>
              <Route index element={null} />
            </Route>

            {/* App routes with shared layout */}
            {/* Cached pages render null here — PersistentPageCache manages them */}
            <Route path="/app" element={<AppLayout />}>
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
              <Route path="jobs" element={null} />
              {/* Dynamic routes — rendered via Outlet */}
              <Route path="post/:postId" element={<SinglePostPage />} />
              <Route path="video/:tokenId" element={<SinglePostPage />} />
              <Route path="post/:postId/info" element={<PostInfoPage />} />
            </Route>

            {/* Username-based profile route (e.g., /d, /username) */}
            <Route path="/:username" element={<ProfilePage />} />


            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </>
    );
}

import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={darkTheme()} modalSize="compact">
        <AuthProvider>
          <OptimisticPostsProvider>
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </OptimisticPostsProvider>
        </AuthProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  </QueryClientProvider>
);

export default App;
