import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { UsernameRequiredModal } from "@/components/app/modals";
import { LoginModal } from "@/components/app/LoginModal";
import { useAuth } from "@/contexts/AuthContext";
import { usePreloadIcons } from "@/hooks/use-preload-icons";
import Index from "./pages/Index";
import DeleteAccount from "./pages/DeleteAccount";
import CreatorsPage from "./pages/app/CreatorsPage";
import NotFound from "./pages/NotFound";

// App routes
import { AppLayout } from "./components/app/AppLayout";
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
import PostPage from "./pages/app/PostPage";
import AssistantPage from "./pages/app/AssistantPage";

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
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/creators" element={<CreatorsPage />} />
            
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
              <Route path="post/:postId" element={<PostPage />} />
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
