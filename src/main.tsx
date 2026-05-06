import "./lib/canvas-polyfills"; // Must run before any canvas usage (Safari 15 compat)
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { clearChunkReloadFlag } from "./lib/lazy-with-retry";
import App from "./App.tsx";
import "./i18n";
import "./lib/toast-i18n-interceptor"; // Auto-translate all toast messages
import "./i18n/auth-toast-translations"; // Runtime auth toast translations for all languages
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

// Remove the HTML boot shell once the home feed is ready, OR after a safety timeout.
// Boot shell sits outside #root so it persists through React mount; we remove it
// only when real content is in place to avoid any second-stage skeleton flash.
(function setupBootShellRemoval() {
  const remove = () => {
    const el = document.getElementById('boot-shell');
    if (el) el.remove();
  };
  let removed = false;
  const safe = () => { if (removed) return; removed = true; remove(); };
  window.addEventListener('home-feed-boot-ready', safe, { once: true });
  // Safety fallback: remove after 10s no matter what so users on broken APIs aren't stuck.
  setTimeout(safe, 10000);
})();

// App entry point
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
