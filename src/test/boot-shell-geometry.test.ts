/**
 * The boot shell's geometry, pinned to the files it was copied from.
 *
 * index.html paints the welcome card before any bundle arrives, in the same
 * place the real panel will land. It cannot ask the app where that is: the app
 * publishes `--app-main-left`/`--app-main-width` from a ResizeObserver on
 * <main> (AppLayout), which needs a tree that does not exist yet at boot. So
 * the boot CSS mirrors the three inputs the app's own layout is built from.
 *
 * Mirrored values rot. This asserts each one against the file it came from, so
 * changing a rail width or a tab-bar padding fails here instead of quietly
 * sliding the boot card a few pixels off the real one — a drift nobody would
 * notice in review and everybody would notice as a jump on load.
 *
 * Tailwind spacing: 1 unit = 4px (pt-1 = 4px, pb-2 = 8px, pb-3 = 12px).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const indexHtml = read('index.html');
const sidebar = read('src/components/app/navigation/DesktopSidebar.tsx');
const appLayout = read('src/components/app/AppLayout.tsx');
const homePage = read('src/pages/app/HomePage.tsx');
const homeIntro = read('src/components/app/HomeIntro.tsx');
const collapseCtx = read('src/contexts/SidebarCollapseContext.tsx');

/** The boot shell's own <style> rules, isolated from the rest of index.html. */
const bootCss = (() => {
  const blocks = [...indexHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const found = blocks.find((b) => b.includes('#boot-shell'));
  if (!found) throw new Error('boot-shell CSS not found in index.html');
  return found;
})();

const TW = 4; // Tailwind spacing unit, px

describe('boot shell geometry mirrors the app shell', () => {
  it('uses the desktop rail widths DesktopSidebar actually renders', () => {
    // `isCollapsed ? "w-[60px] ..." : "... lg:w-[231px] ..."`
    expect(sidebar).toContain('w-[60px]');
    expect(sidebar).toContain('lg:w-[231px]');
    expect(bootCss).toMatch(/\.bs-rail\s*\{[^}]*width:\s*231px/);
    expect(bootCss).toMatch(/\[data-collapsed="true"\]\s*\.bs-rail\s*\{\s*width:\s*60px/);
  });

  it('keeps the rail desktop-only, at the same breakpoint', () => {
    // `hidden lg:flex` — lg is 1024px, and the boot CSS must not show a rail below it.
    expect(sidebar).toContain('hidden lg:flex');
    expect(bootCss).toMatch(/\.bs-rail\s*\{[^}]*display:\s*none/);
    expect(bootCss).toContain('@media (min-width: 1024px)');
  });

  it('uses the row cap AppLayout applies', () => {
    expect(appLayout).toContain("'80rem'");
    expect(bootCss).toMatch(/\.bs-row\s*\{[^}]*max-width:\s*80rem/);
    // Collapsed on a home-feed route widens it to the full viewport.
    expect(appLayout).toContain("'100%'");
    expect(bootCss).toMatch(/\[data-collapsed="true"\]\s*\.bs-row\s*\{\s*max-width:\s*100%/);
  });

  it('reserves exactly the sticky tab bar height, derived from its own padding', () => {
    const bar = homePage.split('\n').find((l) => l.includes('sticky top-11 lg:top-0'));
    expect(bar, 'HomePage sticky tab bar not found').toBeTruthy();
    // Mobile header offset: `top-11`.
    expect(bar).toContain('top-11');
    expect(bootCss).toMatch(/\.bs-main\s*\{[^}]*padding-top:\s*44px/); // 11 * 4

    // The bar's own box: buttons are h-[35px] inside pt-1 pb-2 / sm:pb-3 / lg:pt-2.
    expect(homePage).toContain('h-[35px]');
    const BTN = 35;
    for (const cls of ['pt-1', 'pb-2', 'sm:pb-3', 'lg:pt-2']) {
      expect(bar, `tab bar lost ${cls}`).toContain(cls);
    }
    const base = 1 * TW + BTN + 2 * TW; // pt-1 + button + pb-2
    const sm = 1 * TW + BTN + 3 * TW; // sm:pb-3
    const lg = 2 * TW + BTN + 3 * TW; // lg:pt-2 + sm:pb-3
    expect([base, sm, lg]).toEqual([47, 51, 55]);
    expect(bootCss).toMatch(new RegExp(`\\.bs-tabs\\s*\\{\\s*height:\\s*${base}px`));
    expect(bootCss).toMatch(new RegExp(`\\.bs-tabs\\s*\\{\\s*height:\\s*${sm}px`));
    expect(bootCss).toMatch(new RegExp(`\\.bs-tabs\\s*\\{\\s*height:\\s*${lg}px`));
  });

  it('drops the tab bar spacer exactly where HomePage hides the bar', () => {
    // `isCollapsed && "lg:hidden"` — collapsed desktop shows GlobalFeedNav instead.
    expect(homePage).toContain('lg:hidden');
    expect(bootCss).toMatch(/\[data-collapsed="true"\]\s*\.bs-tabs\s*\{\s*display:\s*none/);
  });

  it("uses HomeIntro's own margins and radius", () => {
    // `mx-2 mb-3 rounded-2xl ... sm:mx-3`
    expect(homeIntro).toContain('mx-2 mb-3');
    expect(homeIntro).toContain('sm:mx-3');
    expect(homeIntro).toContain('rounded-2xl');
    expect(bootCss).toMatch(/\.bs-card\s*\{[^}]*margin:\s*0 8px 12px/); // mx-2 mb-3
    expect(bootCss).toMatch(/\.bs-card\s*\{\s*margin:\s*0 12px 12px/); // sm:mx-3
    expect(bootCss).toMatch(/\.bs-card\s*\{[^}]*border-radius:\s*16px/); // rounded-2xl
  });

  it('reads the collapse flag from the key SidebarCollapseContext writes', () => {
    expect(collapseCtx).toContain("const STORAGE_KEY = 'sidebar-collapsed'");
    expect(indexHtml).toContain('localStorage.getItem("sidebar-collapsed")');
  });

  it('sizes the card by its own width, as HomeIntro does', () => {
    // HomeIntro is @container-driven on purpose: a viewport `lg:` fires while
    // the feed column is still ~430px wide and crushes the headline into the
    // hero art. The boot card must not reintroduce that bug.
    expect(homeIntro).toContain('dehub-intro');
    expect(bootCss).toContain('container-type: inline-size');
    expect(bootCss).toContain('@container bootcard (min-width: 760px)');
  });
});
