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
import Index from "./pages/Index";
import DeleteAccount from "./pages/DeleteAccount";
import CreatorsPage from "./pages/app/CreatorsPage";
import JobsPage from "./pages/JobsPage";
import SkillPage from "./pages/SkillPage";
import NotFound from "./pages/NotFound";

// App routes
import { AppLayout } from "./components/app/AppLayout";
import TVPage from "./pages/app/TVPage";
import HomePage from "./pages/app/HomePage";
import ExplorePage from "./pages/app/ExplorePage";
import ProfilePage from "./pages/app/ProfilePage";
import PlaceholderPage from "./pages/app/PlaceholderPage";
import NotificationsPage from "./pages/app/NotificationsPage";
import MessagesPage from "./pages/app/MessagesPage";
import LeaderboardPage from "./pages/app/LeaderboardPage";
import BookmarksPage from "./pages/app/BookmarksPage";
import SettingsPage from "./pages/app/SettingsPage";
import CommandCentrePage from "./pages/app/CommandCentrePage";
import MusicPage from "./pages/app/MusicPage";
import PostInfoPage from "./pages/app/PostInfoPage";
import SinglePostPage from "./pages/app/SinglePostPage";
import AssistantPage from "./pages/app/AssistantPage";
import BuyCoinsPage from "./pages/app/BuyCoinsPage";
import AgentsPage from "./pages/app/AgentsPage";
import FeaturesPage from "./pages/app/FeaturesPage";


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
