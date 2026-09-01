import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOME_PAGE = readFileSync(resolve(__dirname, '../pages/app/HomePage.tsx'), 'utf8');
const GLOBAL_NAV = readFileSync(resolve(__dirname, '../components/app/GlobalFeedNav.tsx'), 'utf8');
const HOME_FEED = readFileSync(resolve(__dirname, '../components/app/feeds/HomeFeed.tsx'), 'utf8');

const NAV_PILL = 'data-feed-nav className="flex flex-col';

/** Where each nav renders the two portal targets, in source order. */
const NAVS = [
  { name: 'HomePage', source: HOME_PAGE, filters: 'ref={homeFiltersRef}', chips: 'ref={homeChipsRef}' },
  { name: 'GlobalFeedNav', source: GLOBAL_NAV, filters: 'ref={setFiltersPortalElement}', chips: 'ref={setChipsPortalElement}' },
] as const;

describe('feed filter portal order', () => {
  it('keeps the filter panel inside the nav pill, below the tabs', () => {
    for (const { name, source } of NAVS) {
      expect(source, `${name} keeps the pill a flex column`).toContain(NAV_PILL);
    }
    expect(HOME_FEED).toContain('portalTarget && "order-1 mt-2"');
  });

  it('keeps the active-filter chips outside the nav pill', () => {
    // The chips describe the feed; they are not another row of the navigation.
    // Rendering them into the filter panel's target put a row of badges inside
    // the pill and grew the bar every time a filter was on.
    expect(HOME_FEED).toContain('createPortal(chipsBar, chipsTarget)');

    for (const { name, source, filters, chips } of NAVS) {
      const filtersIndex = source.indexOf(filters);
      const chipsIndex = source.indexOf(chips);
      expect(filtersIndex, `${name} renders a filter portal target`).toBeGreaterThan(-1);
      expect(chipsIndex, `${name} renders a chips portal target`).toBeGreaterThan(-1);
      expect(chipsIndex, `${name} puts the chips after the filter panel`).toBeGreaterThan(filtersIndex);
      // The filter target sits inside the pill, so something has to close
      // between the two — otherwise the chips are back to being siblings of
      // the panel inside it.
      expect(
        source.slice(filtersIndex, chipsIndex),
        `${name} closes the pill before the chips target`,
      ).toContain('</div>');
    }
  });
});
