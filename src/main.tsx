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
// War theme chrome. Imported after index.css so its square/olive HUD surfaces
// win over the shared canvas-theme glass block. Scoped entirely to
// html[data-theme="war"], so it is inert under every other theme.
//
// Order matters: war-frame.css owns the design tokens and the reusable HUD
// primitives (chamfers, brackets, tick rulers, meters, badges); war-theme.css
// consumes them to dress every app surface. Swapping these two leaves every
// var(--war-*) unresolved.
import "./styles/war-frame.css";
import "./styles/war-theme.css";
import "./styles/war-nav.css";
// Closes the portal gap (modals/drawers/dropdowns/toasts sit outside #app-root)
// and binds the war-frame primitives onto real app surfaces.
import "./styles/war-coverage.css";
// Rebuilds the comments composer as a HUD console. Must load after
// war-theme.css: several of its rules tie that file's section 6 on specificity
// and win only on source order.
import "./styles/war-comments.css";
// Last: the brand mark's phosphor treatment overrides the shared canvas-theme
// filter that index.css puts on mobile-header images.
import "./styles/war-logo.css";

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
