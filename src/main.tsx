import "./lib/canvas-polyfills"; // Must run before any canvas usage (Safari 15 compat)
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { clearChunkReloadFlag } from "./lib/lazy-with-retry";
import { registerServiceWorker } from "./lib/register-sw";
import { installSupabaseInterceptor } from "./lib/supabase-interceptor";
import "./lib/toast-i18n-interceptor";
// NOTE: auth-toast translations are no longer imported here — English lives in
// locales/en.json and other languages are merged lazily by loadLanguage()
// (see src/i18n/index.ts). The old static import evaluated a 600-line
// all-language map on the main thread at boot.
import App from "./App.tsx";
import "./i18n";
import "./index.css";

clearChunkReloadFlag();
installSupabaseInterceptor();

// Mirror hosts (cosmic-echo-hero.lovable.app etc.) must never index as
// duplicates of dehub.io. index.html carries an inline flip script, but
// Lovable's published snapshot strips inline scripts — the app bundle is the
// only code guaranteed to ship everywhere, so repeat the guard here and
// CREATE the meta if the host HTML lacks it.
const dhHost = location.hostname;
if (dhHost !== "dehub.io" && dhHost !== "localhost" && dhHost !== "127.0.0.1") {
  let dhRobots = document.querySelector('meta[name="robots"]');
  if (!dhRobots) {
    dhRobots = document.createElement("meta");
    dhRobots.setAttribute("name", "robots");
    document.head.appendChild(dhRobots);
  }
  dhRobots.setAttribute("content", "noindex, nofollow");
}

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

// Register the offline-shell / asset-cache service worker (production only,
// deferred to `load` so it doesn't compete with first paint). See lib/register-sw.ts.
registerServiceWorker();
