import "./lib/canvas-polyfills"; // Must run before any canvas usage (Safari 15 compat)
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { clearChunkReloadFlag } from "./lib/lazy-with-retry";
import { installSupabaseInterceptor } from "./lib/supabase-interceptor";
import "./lib/toast-i18n-interceptor";
import "./i18n/auth-toast-translations";
import App from "./App.tsx";
import "./i18n";
import "./index.css";

clearChunkReloadFlag();
installSupabaseInterceptor();

// Global handler for stale-deployment chunk failures.
window.addEventListener('vite:preloadError', () => {
  const RELOAD_KEY = 'vite-preload-error-reload';
  if (!sessionStorage.getItem(RELOAD_KEY)) {
    sessionStorage.setItem(RELOAD_KEY, 'true');
    window.location.reload();
  } else {
    sessionStorage.removeItem(RELOAD_KEY);
  }
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
