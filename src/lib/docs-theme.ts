/**
 * Docs theme resolution.
 *
 * The docs/blog surface has its own next-themes light/dark toggle
 * (`storageKey="dehub-docs-theme"`), but it must also react to the app
 * appearance theme (`html[data-theme=…]`). This maps the app theme to a
 * `forcedTheme` for next-themes so the docs surface is deterministic:
 *
 * - canvas themes → pinned `dark` (glass-over-canvas; one class for the CSS to
 *   target, and the animated background is always dark)
 * - minimal → pinned `dark` (the app skin is a flat black canvas, so docs
 *   follow it as solid black instead of flipping to paper)
 * - light → pinned `light` (clean paper)
 * - system → `undefined` (the docs light/dark toggle stays live, unchanged)
 *
 * Every canvas theme must also appear in each `:is()` list in
 * styles/docs-glass.css; src/test/docs-theme-lists.test.ts holds the two, and
 * the app's THEME_OPTIONS, together.
 */
export const DOCS_CANVAS_THEMES = ['cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'war', 'osaka', 'jungle', 'island', 'hacker', 'horror'] as const;

export function isDocsCanvasTheme(appTheme: string | undefined): boolean {
  return !!appTheme && (DOCS_CANVAS_THEMES as readonly string[]).includes(appTheme);
}

export function getDocsForcedTheme(appTheme: string | undefined): 'dark' | 'light' | undefined {
  if (isDocsCanvasTheme(appTheme)) return 'dark';
  if (appTheme === 'minimal' || appTheme === 'immersive') return 'dark';
  if (appTheme === 'light') return 'light';
  return undefined;
}
