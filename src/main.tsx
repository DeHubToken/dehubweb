import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App.tsx";
import "./i18n";
import "./index.css";
import { installSupabaseInterceptor } from "./lib/supabase-interceptor";

// Install usage tracking before any Supabase calls
installSupabaseInterceptor();

// App entry point
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
