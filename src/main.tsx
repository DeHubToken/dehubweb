import "./lib/canvas-polyfills"; // Must run before any canvas usage (Safari 15 compat)
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { shouldReloadForChunkError } from "./lib/lazy-with-retry";
import { registerServiceWorker } from "./lib/register-sw";
import { installScrollFreezeWatchdog } from "./lib/scroll-freeze-watchdog";
import { installSupabaseInterceptor } from "./lib/supabase-interceptor";
import "./lib/toast-i18n-interceptor";
// NOTE: auth-toast translations are no longer imported here — English lives in
// locales/en.json and other languages are merged lazily by loadLanguage()
// (see src/i18n/index.ts). The old static import evaluated a 600-line
// all-language map on the main thread at boot.
import App, { preloadWalletProviders } from "./App.tsx";
import { loadThemeCss } from "./lib/theme-css";
import "./i18n";
import "./index.css";
// Canvas-theme chrome (war / osaka / jungle) is NOT imported here: each theme
// is a separate CSS chunk loaded by src/lib/theme-css.ts, only for the theme in
// use. Their cascade order (after index.css) is preserved because a dynamic
// stylesheet link is appended at the end of <head>.

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

// Global handler for stale-deployment chunk failures. Shares the cooldown with
// lazyWithRetry and the ErrorBoundary so the three paths can't reload over each
// other — this one used to keep its own flag that was never cleared, so a
// second stale deploy in the same session got no reload at all.
window.addEventListener('vite:preloadError', () => {
  if (shouldReloadForChunkError()) window.location.reload();
});

// Two things are awaited before the first render, both so that the HTML shell
// (the boot skeleton with the prerendered welcome panel) is replaced by the
// finished app in ONE commit rather than by an intermediate state:
//
// - the theme's stylesheet chunk, when the theme stamped on <html> by the
//   inline head script has one (war / osaka / jungle), so those users never
//   see the default chrome first;
// - the wallet/auth provider chunk, which wraps every route behind a Suspense
//   boundary. Rendering before it has resolved makes React's first commit that
//   boundary's fallback: the prerendered panel vanishes into a loading skeleton
//   and reappears a beat later. The chunk is modulepreloaded from index.html
//   and its download is kicked at App's module evaluation, so this wait is
//   normally a few milliseconds; a failure still renders (the retry / reload
//   handling inside lazyWithRetry and the ErrorBoundary take it from there).
const render = () => {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
};
const bootThemeCss = loadThemeCss(document.documentElement.dataset.theme);
Promise.all([bootThemeCss, preloadWalletProviders()]).then(render, render);

// Register the offline-shell / asset-cache service worker (production only,
// deferred to `load` so it doesn't compete with first paint). See lib/register-sw.ts.
registerServiceWorker();

// Watch for the page losing the ability to scroll — a leaked body lock or a
// stuck overlay — report what caused it and put it back. Touch devices only.
// See lib/scroll-freeze-watchdog.ts.
installScrollFreezeWatchdog();
