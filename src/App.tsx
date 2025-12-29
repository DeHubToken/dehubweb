import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DeleteAccount from "./pages/DeleteAccount";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          
          {/* App routes with shared layout */}
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="bookmarks" element={<BookmarksPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
