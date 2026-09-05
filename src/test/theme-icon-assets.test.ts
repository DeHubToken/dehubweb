import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveThemeIconAsset } from '@/components/app/war/WarHudIcon';

const FULL_THEMES = ['hazy', 'swarms', 'winter', 'osaka', 'jungle'];
const PROFILE_KEYS = [
  'home', 'posts', 'images', 'videos', 'subscriptions', 'audio', 'live',
  'fractions', 'pinned', 'search', 'messages', 'bookmarks',
];
const PAGE_KEYS = [
  'wand', 'communities', 'careers', 'features', 'glossary', 'governance',
  'trophy', 'notifications', 'settings', 'stages', 'assistant', 'lock', 'profile',
  'arcade', 'stores', 'bounties', 'events', 'stats', 'ads', 'command',
  'email', 'accounts', 'usernames', 'tv', 'superpowers',
];

describe('theme icon assets', () => {
  it('ships every profile and page icon for each full raster theme', () => {
    for (const theme of FULL_THEMES) {
      for (const key of [...PROFILE_KEYS, ...PAGE_KEYS]) {
        const file = resolve(__dirname, `../../public/theme-icons/${theme}/${key}.webp`);
        expect(existsSync(file), `${theme}/${key}.webp`).toBe(true);
        expect(statSync(file).size, `${theme}/${key}.webp is unexpectedly empty`).toBeGreaterThan(2_000);
      }
    }
  });

  it('ships the complete optimized System icon set', () => {
    for (const key of [...PROFILE_KEYS, ...PAGE_KEYS]) {
      const file = resolve(__dirname, `../../public/theme-icons/system/${key}.webp`);
      expect(existsSync(file), `system/${key}.webp`).toBe(true);
      expect(statSync(file).size, `system/${key}.webp is unexpectedly empty`).toBeGreaterThan(2_000);
    }
  });

  it('routes old asset stems to the matching themed WebP', () => {
    expect(resolveThemeIconAsset('/assets/settings-icon-abc.png', 'system'))
      .toBe('/theme-icons/system/settings.webp');
    expect(resolveThemeIconAsset('/assets/notifications-icon-abc.png', 'winter'))
      .toBe('/theme-icons/winter/notifications.webp');
    expect(resolveThemeIconAsset('/assets/home-3d-icon-abc.png', 'jungle'))
      .toBe('/theme-icons/jungle/home.webp');
    expect(resolveThemeIconAsset('/assets/home-3d-icon-abc.png', 'system'))
      .toBe('/theme-icons/system/home.webp');
    expect(resolveThemeIconAsset('/theme-icons/system/arcade.webp', 'osaka'))
      .toBe('/theme-icons/osaka/arcade.webp');
    expect(resolveThemeIconAsset('/theme-icons/system/bounties.webp', 'system'))
      .toBe('/theme-icons/system/bounties.webp');
  });

  it('leaves Cosmic, Lava Lamp, Light and Minimal on their existing art', () => {
    for (const theme of ['cosmic', 'lavalamp', 'light', 'minimal']) {
      expect(resolveThemeIconAsset('/assets/home-3d-icon-abc.png', theme)).toBeNull();
      expect(resolveThemeIconAsset('/assets/settings-icon-abc.png', theme)).toBeNull();
    }
  });

  it('does not pin page title icons to the System asset path', () => {
    const pageFiles = [
      'src/pages/app/AdsPage.tsx',
      'src/pages/app/ArcadePage.tsx',
      'src/pages/app/CommandCentrePage.tsx',
      'src/pages/app/EventsPage.tsx',
      'src/pages/app/NotificationsPage.tsx',
      'src/pages/app/SettingsPage.tsx',
      'src/pages/app/StatsPage.tsx',
      'src/pages/app/StoresPage.tsx',
      'src/pages/app/AccountsPage.tsx',
      'src/pages/app/UsernamesPage.tsx',
      'src/pages/app/TVPage.tsx',
      'src/pages/app/SuperPowersPage.tsx',
      'src/pages/app/WorkPage.tsx',
    ];

    for (const file of pageFiles) {
      const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(source, file).not.toMatch(/<BrandIcon\s+src=["']\/theme-icons\/system\//);
    }
  });

  it('keeps page and state identity surfaces on themed icons', () => {
    const guardedImports: Record<string, RegExp> = {
      'src/pages/app/StoresPage.tsx': /\b(Store|ShoppingBag|PackagePlus)\b/,
      'src/pages/app/WorkPage.tsx': /\b(Briefcase|Search|Scissors|MessageSquare)\b/,
      'src/pages/app/WorkPostPage.tsx': /\b(Briefcase|Scissors|MessageSquare)\b/,
      'src/pages/app/WorkJobDetailPage.tsx': /\bBriefcase\b/,
      'src/components/app/stores/SetupStoreFlow.tsx': /\bStore\b/,
      'src/components/app/stores/EditStoreDrawer.tsx': /\bStore\b/,
      'src/components/app/stores/StoreListingCard.tsx': /\bImageIcon\b/,
      'src/components/app/stores/StoreLinkEmbed.tsx': /\b(StoreIcon|ImageIcon)\b/,
      'src/features/work/components/JobCard.tsx': /\bBriefcase\b/,
      'src/features/work/components/BountyLinkEmbed.tsx': /\bBriefcase\b/,
      'src/components/app/settings/EmailSignInSettings.tsx': /\bMail\b/,
      'src/components/app/login/LoginModalBody.tsx': /\bMail\b/,
      'src/pages/app/AccountsPage.tsx': /\bUsers\b/,
      'src/pages/app/UsernamesPage.tsx': /\bAtSign\b/,
      'src/pages/app/SuperPowersPage.tsx': /\bRocket\b/,
      'src/components/app/tv/TVPreviewCard.tsx': /\bTv\b/,
      'src/components/app/tv/TVChannelCard.tsx': /\bTv\b/,
    };

    for (const [file, pattern] of Object.entries(guardedImports)) {
      const imports = readFileSync(resolve(__dirname, '../..', file), 'utf8')
        .split('\n')
        .filter((line) => line.includes("from 'lucide-react'"))
        .join('\n');
      expect(imports, file).not.toMatch(pattern);
    }
  });
});
