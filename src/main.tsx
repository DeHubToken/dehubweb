import "./lib/canvas-polyfills"; // Must run before any canvas usage (Safari 15 compat)
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { clearChunkReloadFlag } from "./lib/lazy-with-retry";
import App from "./App.tsx";
import "./i18n";
import "./index.css";

// Clear chunk reload flag on successful boot (prevents stale flag from previous deploy)
clearChunkReloadFlag();

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

// Remove the HTML boot shell once the home feed is ready, OR after a safety timeout.
// Fades out so the handoff to real chrome is visually distinct (perceived speed).
(function setupBootShellRemoval() {
  const FADE_MS = 180;
  const remove = () => {
    const el = document.getElementById('boot-shell');
    if (!el) return;
    el.style.transition = `opacity ${FADE_MS}ms ease-out`;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), FADE_MS);
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

// Defer non-critical startup work until after first paint so it doesn't
// compete with React mount + WalletProviders chunk parsing.
const deferStartup = () => {
  import("./lib/supabase-interceptor").then(m => m.installSupabaseInterceptor()).catch(() => {});
  import("./lib/toast-i18n-interceptor").catch(() => {});
  import("./i18n/auth-toast-translations").catch(() => {});
};
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(deferStartup, { timeout: 2000 });
} else {
  setTimeout(deferStartup, 1000);
}
