import defaultBanner1 from '@/assets/banners/default-banner-1.png';
import defaultBanner2 from '@/assets/banners/default-banner-2.png';
import defaultBanner3 from '@/assets/banners/default-banner-3.png';
import defaultBanner4 from '@/assets/banners/default-banner-4.png';
import defaultBanner5 from '@/assets/banners/default-banner-5.png';
import defaultBanner6 from '@/assets/banners/default-banner-6.png';
import defaultBanner7 from '@/assets/banners/default-banner-7.png';
import defaultBanner8 from '@/assets/banners/default-banner-8.png';
import defaultBanner9 from '@/assets/banners/default-banner-9.png';

// Cosmetic wallet overrides: show a different address on profile without changing backend logic
export const DISPLAY_WALLET_OVERRIDES: Record<string, string> = {
  '0x9324840523a5d17dd12a2f11a9472e5a199c1937': '0xbb0265021e03a048a6e8dcf249cd5067f35db45d',
};

const DEFAULT_BANNERS = [
  defaultBanner1,
  defaultBanner2,
  defaultBanner3,
  defaultBanner4,
  defaultBanner5,
  defaultBanner6,
  defaultBanner7,
  defaultBanner8,
  defaultBanner9,
];

/**
 * Get a deterministic default banner based on wallet address
 * Uses simple hash to consistently assign same banner to same user
 */
export function getDefaultBanner(walletAddress?: string): string {
  if (!walletAddress) return DEFAULT_BANNERS[0];
  
  // Simple hash: sum char codes and mod by banner count
  const hash = walletAddress.toLowerCase().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DEFAULT_BANNERS[hash % DEFAULT_BANNERS.length];
}

export type TabValue = 'home' | 'posts' | 'images' | 'videos' | 'subscribers' | 'songs' | 'live' | 'fractions' | 'pinned';

/**
 * Canonical list of profile tabs a user can pick as the one visitors land on
 * first. Order/labels mirror the tabs rendered on the profile page (the "All"
 * tab is `home`). Used by the settings selector and to validate the stored
 * `customs.defaultProfileTab` value.
 */
export const PROFILE_TAB_OPTIONS: { value: TabValue; label: string }[] = [
  { value: 'home', label: 'All' },
  { value: 'posts', label: 'Posts' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
  { value: 'subscribers', label: 'Subscriptions' },
  { value: 'songs', label: 'Audio' },
  { value: 'live', label: 'Live' },
  { value: 'fractions', label: 'Fractions' },
  { value: 'pinned', label: 'Pinned' },
];

/** Fallback tab shown when a profile has no saved preference. */
export const DEFAULT_PROFILE_TAB: TabValue = 'home';

/**
 * Coerce an arbitrary stored value into a valid TabValue, falling back to the
 * default when the value is missing or unrecognized.
 */
export function parseDefaultProfileTab(raw?: unknown): TabValue {
  return PROFILE_TAB_OPTIONS.some((o) => o.value === raw)
    ? (raw as TabValue)
    : DEFAULT_PROFILE_TAB;
}
