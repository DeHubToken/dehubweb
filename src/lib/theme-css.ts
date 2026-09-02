/**
 * Canvas-theme chrome, loaded only for the theme in use.
 *
 * War, Osaka and Jungle each dress every app surface with their own stylesheet
 * set (frame tokens → theme → nav / coverage / comments / logo). Imported
 * statically from main.tsx they rode inside the one render-blocking index CSS
 * for every visitor: roughly 250 KB of the ~520 KB stylesheet was rules that
 * only apply under `html[data-theme="war"|"osaka"|"jungle"]`. Each theme is now
 * its own CSS chunk (src/styles/<theme>.css is an @import bundle that fixes the
 * intra-theme order), fetched on demand:
 *
 * - at boot, main.tsx awaits the chunk for the theme the inline head script
 *   already stamped on <html> before it renders, so a theme user never sees the
 *   default chrome first;
 * - on a theme switch, ThemeContext awaits it before changing data-theme.
 *
 * Cascade order is unchanged: Vite appends a dynamically imported stylesheet
 * at the end of <head>, i.e. after index.css, exactly where the static imports
 * sat. Everything else (light, minimal, the shared canvas glass block) still
 * lives in index.css.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  war: () => import('@/styles/war.css'),
  osaka: () => import('@/styles/osaka.css'),
  jungle: () => import('@/styles/jungle.css'),
};

const inflight = new Map<string, Promise<void>>();

/** Resolves once the theme's stylesheet is applied; null when the theme has none. */
export function loadThemeCss(theme: string | null | undefined): Promise<void> | null {
  if (!theme) return null;
  const load = loaders[theme];
  if (!load) return null;
  let pending = inflight.get(theme);
  if (!pending) {
    pending = load().then(
      () => undefined,
      () => {
        // A failed fetch must not wedge the theme forever: forget it so the
        // next switch (or reload) retries.
        inflight.delete(theme);
      },
    );
    inflight.set(theme, pending);
  }
  return pending;
}

export function hasThemeCss(theme: string | null | undefined): boolean {
  return !!theme && theme in loaders;
}
