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

// Pages — lazy loaded (only download when user visits that route)
const Index = React.lazy(() => import("./pages/Index"));
const DeleteAccount = React.lazy(() => import("./pages/DeleteAccount"));
const CreatorsPage = React.lazy(() => import("./pages/app/CreatorsPage"));
const JobsPage = React.lazy(() => import("./pages/JobsPage"));
const SkillPage = React.lazy(() => import("./pages/SkillPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const TVPage = React.lazy(() => import("./pages/app/TVPage"));
const HomePage = React.lazy(() => import("./pages/app/HomePage"));
const ExplorePage = React.lazy(() => import("./pages/app/ExplorePage"));
const ProfilePage = React.lazy(() => import("./pages/app/ProfilePage"));
const NotificationsPage = React.lazy(() => import("./pages/app/NotificationsPage"));
const MessagesPage = React.lazy(() => import("./pages/app/MessagesPage"));
const LeaderboardPage = React.lazy(() => import("./pages/app/LeaderboardPage"));
const BookmarksPage = React.lazy(() => import("./pages/app/BookmarksPage"));
const SettingsPage = React.lazy(() => import("./pages/app/SettingsPage"));
const CommandCentrePage = React.lazy(() => import("./pages/app/CommandCentrePage"));
const MusicPage = React.lazy(() => import("./pages/app/MusicPage"));
const PostInfoPage = React.lazy(() => import("./pages/app/PostInfoPage"));
const SinglePostPage = React.lazy(() => import("./pages/app/SinglePostPage"));
const AssistantPage = React.lazy(() => import("./pages/app/AssistantPage"));
const BuyCoinsPage = React.lazy(() => import("./pages/app/BuyCoinsPage"));
const AgentsPage = React.lazy(() => import("./pages/app/AgentsPage"));
const FeaturesPage = React.lazy(() => import("./pages/app/FeaturesPage"));
const FullWalletPage = React.lazy(() => import("./pages/app/FullWalletPage"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-black">
    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
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

import { useDMRealtime } from "@/hooks/use-dm-realtime";

// Inner app component that uses auth context
function AppContent() {
  const { isLoginModalOpen, closeLoginModal } = useAuth();
  
  // Preload 3D icons on app mount to prevent flicker during navigation
  usePreloadIcons();
  
  // Subscribe to global DM updates
  useDMRealtime();
  
  return (
    <>
      <Sonner />
      <UsernameRequiredModal />
      <LoginModal open={isLoginModalOpen} onOpenChange={closeLoginModal} />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/creators" element={<CreatorsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/skill.md" element={<SkillPage />} />
            <Route path="/features" element={<AppLayout />}>
              <Route index element={<FeaturesPage />} />
            </Route>

            {/* App routes with shared layout */}
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="bookmarks" element={<BookmarksPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="command-centre" element={<CommandCentrePage />} />
              <Route path="wallet" element={<FullWalletPage />} />
              <Route path="music" element={<MusicPage />} />
              <Route path="buy" element={<BuyCoinsPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="tv" element={<TVPage />} />
              <Route path="features" element={<FeaturesPage />} />
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
