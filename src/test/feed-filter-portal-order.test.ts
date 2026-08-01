import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOME_PAGE = readFileSync(resolve(__dirname, '../pages/app/HomePage.tsx'), 'utf8');
const GLOBAL_NAV = readFileSync(resolve(__dirname, '../components/app/GlobalFeedNav.tsx'), 'utf8');
const HOME_FEED = readFileSync(resolve(__dirname, '../components/app/feeds/HomeFeed.tsx'), 'utf8');

describe('feed filter portal order', () => {
  it('keeps the panel above active chips after the portal remounts', () => {
    expect(HOME_PAGE).toContain('data-feed-nav className="flex flex-col');
    expect(GLOBAL_NAV).toContain('data-feed-nav className="flex flex-col');
    expect(HOME_FEED).toContain('portalTarget && "order-1 mt-2"');
    expect(HOME_FEED).toContain('portalTarget && "order-2"');
  });
});
