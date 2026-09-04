/**
 * A per-route share card is three edits in three files that cannot see each
 * other: the JPEG in public/og, the key in the worker's OG_CARD_ROUTES, and
 * `image=` on the page's own SEOHead. Miss the middle one and the file sits
 * unreferenced — `superpowers.jpg` did exactly that from the day the page
 * shipped until this test was written. Miss the first and the worker promises
 * crawlers a 1200x630 image that the SPA catch-all answers with HTML.
 *
 * So both directions are asserted here, and every page the worker renders from
 * MARKETING_PAGES is required to have a card rather than falling back to the
 * shared one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const WORKER = readFileSync(resolve(ROOT, 'CLOUDFLARE_WORKER_SEO.js'), 'utf8');

/** The Set body only. A looser slice runs past the closing bracket and drags
 *  in every quoted title string in the file. */
function setBody(name: string): string {
  const start = WORKER.indexOf(`const ${name} = new Set([`);
  expect(start).toBeGreaterThan(-1);
  const end = WORKER.indexOf(']);', start);
  return WORKER.slice(start, end);
}

const keysIn = (body: string) => new Set(body.match(/'[^']+'/g)!.map((s) => s.slice(1, -1)));

const cardKeys = keysIn(setBody('OG_CARD_ROUTES'));
const files = new Set(
  readdirSync(resolve(ROOT, 'public/og')).map((f) => f.replace(/\.\w+$/, '')),
);
const fileFor = (key: string) => key.replace(/\//g, '-');

/** Object keys of a `const X = { ... }` table, top level only. */
function tableKeys(name: string): string[] {
  const start = WORKER.indexOf(`const ${name} = {`);
  expect(start).toBeGreaterThan(-1);
  const body = WORKER.slice(start, WORKER.indexOf('\n};', start));
  // Keys are quoted in MARKETING_PAGES and bare in SECTION_PAGES.
  const keys = [...body.matchAll(/^ {2}'?([\w/-]+)'?: \{/gm)].map((m) => m[1]);
  expect(keys.length).toBeGreaterThan(0);
  return keys;
}

describe('per-route OG cards', () => {
  it('has a file for every card key', () => {
    const missing = [...cardKeys].filter((k) => !files.has(fileFor(k)));
    expect(missing).toEqual([]);
  });

  /** The other direction: art that was rendered and never wired up. */
  it('has a card key for every file', () => {
    // SHARE_IMAGE is referenced by the constant, not through the map.
    const orphans = [...files].filter(
      (f) => f !== 'dehub-social-share' && ![...cardKeys].some((k) => fileFor(k) === f),
    );
    expect(orphans).toEqual([]);
  });

  it('gives every edge-rendered marketing page its own card', () => {
    const without = tableKeys('MARKETING_PAGES').filter((k) => !cardKeys.has(k));
    expect(without).toEqual([]);
  });

  it('gives every feed section page its own card', () => {
    const without = tableKeys('SECTION_PAGES').filter((k) => !cardKeys.has(k));
    expect(without).toEqual([]);
  });

  /**
   * A page that lives only under /app cannot take the default canonical of
   * `/${key}` — that URL has no route, and a canonical pointing at nothing is
   * worse than no canonical. There are none left: every /app section answers at
   * the bare path now, so the right shape for all of them is the default
   * canonical plus an SSR_STATIC_ROUTES entry that collapses the twin onto it.
   * The derivation is kept rather than deleted, inverted to assert the absence —
   * an /app-only page reappearing is the bug, and this is what would see it.
   */
  it('leaves no marketing page reachable only under /app', () => {
    // Derived from the router, not a hand-kept list. The hard-coded trio here
    // named superpowers, stores and fractions and missed `glossary`, which sat
    // in SSR_STATIC_ROUTES with no `path` for as long as it existed: crawlers
    // were handed a canonical /glossary that the router has no route for, while
    // the page itself canonicalized to /app/glossary. Anything added under /app
    // from now on is checked by construction.
    const APP = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
    const staticRoutes = keysIn(setBody('SSR_STATIC_ROUTES'));

    // MARKETING_PAGES is an object literal, not a Set, so setBody cannot read it.
    const mp = WORKER.slice(WORKER.indexOf('const MARKETING_PAGES'));
    const marketingKeys = [...mp.slice(0, mp.indexOf('\n};')).matchAll(/^ {2}'([^']+)':\s*\{/gm)]
      .map((m) => m[1]);

    const appOnly = marketingKeys.filter((key) => {
      // A leading slash is a top-level route; a bare path is nested under
      // AppLayout and therefore only reachable at /app/<key>.
      const topLevel = APP.includes(`path="/${key}"`);
      const nested = APP.includes(`path="${key}"`);
      return nested && !topLevel;
    });

    expect(appOnly, `${appOnly.join(', ')} needs a top-level route`).toEqual([]);

    // The derivation itself still has to be measuring something.
    expect(marketingKeys.length).toBeGreaterThan(10);

    // …and with no /app-only pages left, no entry should be naming its own
    // /app path any more: that override is what pins a canonical to the twin.
    expect(WORKER).not.toContain("path: '/app/");

    // The three that used to be the exception collapse onto the bare URL now.
    for (const key of ['stores', 'fractions', 'superpowers', 'glossary']) {
      expect(staticRoutes.has(key), `${key} should collapse onto /${key}`).toBe(true);
    }
  });
});
