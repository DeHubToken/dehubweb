import { translateCopy as _translateCopy } from '@/i18n/copy';
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

export type TabValue = 'home' | 'posts' | 'images' | 'videos' | 'subscribers' | 'songs' | 'live' | 'fractions' | 'pinned' | 'playlists';

/**
 * Canonical list of profile tabs a user can pick as the one visitors land on
 * first. Order/labels mirror the tabs rendered on the profile page (the "All"
 * tab is `home`). Used by the settings selector and to validate the stored
 * `customs.defaultProfileTab` value.
 */
export const PROFILE_TAB_OPTIONS: { value: TabValue; label: string }[] = [
  { value: 'home', get label() { return _translateCopy("copy.a52ace420f21", { defaultValue: "All" }); } },
  { value: 'posts', get label() { return _translateCopy("copy.a80811cf6889", { defaultValue: "Posts" }); } },
  { value: 'images', get label() { return _translateCopy("copy.be7e2f201293", { defaultValue: "Images" }); } },
  { value: 'videos', get label() { return _translateCopy("copy.c9a9639463c2", { defaultValue: "Videos" }); } },
  { value: 'subscribers', get label() { return _translateCopy("copy.a151f2e912fe", { defaultValue: "Subscriptions" }); } },
  { value: 'songs', get label() { return _translateCopy("copy.bc1b88907d3b", { defaultValue: "Audio" }); } },
  { value: 'live', get label() { return _translateCopy("copy.b64ac05f17e6", { defaultValue: "Live" }); } },
  { value: 'fractions', get label() { return _translateCopy("copy.487aaa977933", { defaultValue: "Fractions" }); } },
  { value: 'pinned', get label() { return _translateCopy("copy.f20c87946555", { defaultValue: "Pinned" }); } },
];

/**
 * Every tab a link can open with `?tab=`. Playlists is on purpose NOT in
 * PROFILE_TAB_OPTIONS: the tab only exists while the profile has a public
 * playlist, so it cannot be the tab a profile opens on by default — but a
 * copied playlist link still has to land on it.
 */
export const LINKABLE_PROFILE_TABS: TabValue[] = [...PROFILE_TAB_OPTIONS.map((o) => o.value), 'playlists'];

export function isProfileTabValue(raw: unknown): raw is TabValue {
  return LINKABLE_PROFILE_TABS.includes(raw as TabValue);
}

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
