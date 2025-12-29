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
import PlaceholderPage from "./pages/app/PlaceholderPage";

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
            <Route path="profile" element={<PlaceholderPage title="Profile" />} />
            <Route path="notifications" element={<PlaceholderPage title="Notifications" />} />
            <Route path="messages" element={<PlaceholderPage title="Messages" />} />
            <Route path="leaderboard" element={<PlaceholderPage title="Leaderboard" />} />
            <Route path="bookmarks" element={<PlaceholderPage title="Bookmarks" />} />
            <Route path="settings" element={<PlaceholderPage title="Settings" />} />
            <Route path="blog" element={<PlaceholderPage title="Blog" />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
