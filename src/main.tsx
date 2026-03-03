import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { clearChunkReloadFlag } from "./lib/lazy-with-retry";
import App from "./App.tsx";
import "./i18n";
import "./index.css";
import { installSupabaseInterceptor } from "./lib/supabase-interceptor";

// Install usage tracking before any Supabase calls
installSupabaseInterceptor();

// Clear chunk reload flag on successful boot (prevents stale flag from previous deploy)
clearChunkReloadFlag();

// Global handler for stale-deployment chunk failures.
// Vite fires this when a <link rel="modulepreload"> or dynamic import() can't be fetched
// (e.g. after a new deploy replaced old chunk filenames). Reload once to get fresh HTML.
window.addEventListener('vite:preloadError', () => {
  const RELOAD_KEY = 'vite-preload-error-reload';
  if (!sessionStorage.getItem(RELOAD_KEY)) {
    sessionStorage.setItem(RELOAD_KEY, 'true');
    window.location.reload();
  } else {
    sessionStorage.removeItem(RELOAD_KEY);
  }
});

// App entry point
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
