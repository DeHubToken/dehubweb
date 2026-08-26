/**
 * Settings search
 * ===============
 * Powers the search box at the top of the Settings page. A hit does three
 * things: switches to the tab the setting lives in, scrolls that setting clear
 * of the sticky header, and flashes it so the reader can see which control
 * they were sent to. Before this, selecting a hit only switched tab and left
 * you scanning a long page for the row you had just searched for.
 *
 * The index is static rather than a live DOM scan because only the open tab is
 * mounted — there is nothing to scan in the other nine. Every entry's `anchor`
 * must match a `data-setting-anchor` in SettingsPage (or in a section
 * component it renders); an entry whose anchor is missing degrades to a plain
 * tab switch rather than breaking.
 *
 * Matching runs against three strings so search works the same in every
 * language:
 *   - `labelKey` — what the row actually renders, so a reader searching in
 *     their own language matches. Every key here is already used by the page,
 *     with the English label as its fallback, so this adds no new i18n keys.
 *   - `label` — the English text, always matched too, so English terms keep
 *     working for readers on a translated UI.
 *   - `keywords` — what people type instead of the label ("dark mode" for
 *     Theme, "2fa" for Two-Factor, "banner" for Cover Image).
 */

import type { TFunction } from 'i18next';

import { getDocumentScrollTop, scrollDocumentTo, scrollDocumentToSmooth } from '@/lib/document-scroll';

export interface SettingsSearchEntry {
  /** Tab the setting lives in — one of SettingsPage's `tabs` values. */
  tab: string;
  /** Matches a `data-setting-anchor` attribute on the row or section. */
  anchor: string;
  /** English label, and the fallback for `labelKey`. */
  label: string;
  /** i18n key the row renders with, if it has one. */
  labelKey?: string;
  /** Extra English terms people search for instead of the label. */
  keywords?: string;
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // Profile
  { tab: 'profile', anchor: 'cover-image', label: 'Cover Image', keywords: 'banner header photo' },
  { tab: 'profile', anchor: 'profile-picture', label: 'Profile Picture', labelKey: 'settings.profilePicture', keywords: 'avatar photo pfp' },
  { tab: 'profile', anchor: 'display-name', label: 'Display Name', labelKey: 'settings.displayName', keywords: 'nickname rename' },
  { tab: 'profile', anchor: 'username', label: 'Username', labelKey: 'settings.username', keywords: 'handle rename @' },
  { tab: 'profile', anchor: 'bio', label: 'Bio', labelKey: 'settings.bio', keywords: 'about description' },
  { tab: 'profile', anchor: 'social-links', label: 'Social Links', labelKey: 'settings.socialLinks', keywords: 'twitter x instagram tiktok youtube discord telegram' },
  { tab: 'profile', anchor: 'sign-in', label: 'Sign-in', labelKey: 'settings.signIn', keywords: 'email login password recovery' },
  { tab: 'profile', anchor: 'ens', label: 'ENS', labelKey: 'settings.ensSection', keywords: 'ens domain eth name verified handle' },
  { tab: 'profile', anchor: 'badge-delegation', label: 'Badge delegation', keywords: 'badge lend borrow tier delegate' },
  { tab: 'profile', anchor: 'profiles', label: 'Profiles', labelKey: 'settings.profiles', keywords: 'accounts switch add account multiple' },

  // Appearance
  { tab: 'appearance', anchor: 'theme', label: 'Theme', labelKey: 'settings.theme', keywords: 'dark light mode skin cosmic jungle osaka winter minimal appearance' },
  { tab: 'appearance', anchor: 'theme-color', label: 'Theme Color', labelKey: 'settings.themeColor', keywords: 'hue colour accent brand rainbow' },
  { tab: 'appearance', anchor: 'dim-lights', label: 'Dim Lights', labelKey: 'settings.dimLights', keywords: 'brightness blue light night filter' },
  { tab: 'appearance', anchor: 'language', label: 'Language', labelKey: 'settings.language', keywords: 'translate locale english' },
  { tab: 'appearance', anchor: 'feed-layout', label: 'Feed Layout', labelKey: 'settings.feedLayout', keywords: 'compact comfortable sidebar density' },
  { tab: 'appearance', anchor: 'default-profile-tab', label: 'Default profile tab', labelKey: 'settings.defaultProfileTab', keywords: 'landing tab visitors' },
  { tab: 'appearance', anchor: 'autoplay', label: 'Auto-play', labelKey: 'settings.autoPlay', keywords: 'autoplay video play automatically' },
  { tab: 'appearance', anchor: 'data-saver', label: 'Data Saver', labelKey: 'settings.dataSaver', keywords: 'bandwidth quality mobile data' },
  { tab: 'appearance', anchor: 'show-animations', label: 'Show Animations', labelKey: 'settings.showAnimations', keywords: 'motion reduce effects' },
  { tab: 'appearance', anchor: 'shorts', label: 'Shorts', labelKey: 'settings.shortsEnabled', keywords: 'shorts tab hide short videos' },

  // Notifications
  { tab: 'notifications', anchor: 'email-notifications', label: 'Email Notifications', labelKey: 'settings.emailNotifications', keywords: 'email inbox' },
  { tab: 'notifications', anchor: 'browser-notifications', label: 'Browser Notifications', labelKey: 'settings.browserNotifications', keywords: 'push desktop permission alerts' },
  { tab: 'notifications', anchor: 'notify-likes', label: 'Likes', labelKey: 'settings.likes', keywords: 'reactions hearts' },
  { tab: 'notifications', anchor: 'notify-comments', label: 'Comments', labelKey: 'settings.comments' },
  { tab: 'notifications', anchor: 'notify-new-followers', label: 'New Followers', labelKey: 'settings.newFollowers', keywords: 'follows' },
  { tab: 'notifications', anchor: 'notify-comment-replies', label: 'Comment Replies', keywords: 'replies' },
  { tab: 'notifications', anchor: 'notify-mentions', label: 'Mentions', keywords: 'tagged @' },
  { tab: 'notifications', anchor: 'notify-tips', label: 'Tips Received', keywords: 'tips dhb earnings' },
  { tab: 'notifications', anchor: 'notify-subscribers', label: 'New Subscribers', keywords: 'subscriptions plan' },
  { tab: 'notifications', anchor: 'notify-ppv', label: 'PPV Purchases', keywords: 'pay per view purchases sales' },
  { tab: 'notifications', anchor: 'notify-livestream', label: 'Livestream Start', keywords: 'live stream going live' },
  { tab: 'notifications', anchor: 'notify-milestones', label: 'Milestones', keywords: 'achievements' },
  { tab: 'notifications', anchor: 'notify-account-alerts', label: 'Account Alerts', keywords: 'security login alerts' },
  { tab: 'notifications', anchor: 'notify-announcements', label: 'Announcements', keywords: 'platform updates news' },
  { tab: 'notifications', anchor: 'buy-bot', label: 'Buy Bot Alerts', keywords: 'chat bot purchases hide' },
  { tab: 'notifications', anchor: 'quiet-hours', label: 'Quiet Hours', labelKey: 'settings.quietHours', keywords: 'silence mute schedule night' },

  // Privacy
  { tab: 'privacy', anchor: 'private-account', label: 'Private Account', labelKey: 'settings.privateAccount', keywords: 'private lock approve followers requests' },
  { tab: 'privacy', anchor: 'new-member', label: 'Show me as a new member', labelKey: 'settings.showAsNewMember', keywords: 'new member badge welcome' },
  { tab: 'privacy', anchor: 'public-profile', label: 'Public Profile', labelKey: 'settings.publicProfile' },
  { tab: 'privacy', anchor: 'follow-visibility', label: 'Follow Visibility', labelKey: 'settings.followVisibility', keywords: 'followers following hide counts' },
  { tab: 'privacy', anchor: 'search-indexing', label: 'Search Engine Indexing', labelKey: 'settings.searchEngineIndexing', keywords: 'google seo index' },
  { tab: 'privacy', anchor: 'default-post-visibility', label: 'Default Post Visibility', labelKey: 'settings.defaultPostVisibility', keywords: 'public private posts' },
  { tab: 'privacy', anchor: 'two-factor', label: 'Two-Factor Auth', labelKey: 'settings.twoFactorAuth', keywords: '2fa mfa authenticator security' },
  { tab: 'privacy', anchor: 'wallet-unlock', label: 'Wallet unlock prompt', labelKey: 'settings.walletUnlockInterval', keywords: 'password timeout lock wallet' },
  { tab: 'privacy', anchor: 'biometric-unlock', label: 'Biometric unlock', keywords: 'fingerprint face id passkey' },
  { tab: 'privacy', anchor: 'wallet-recovery', label: 'Wallet recovery', keywords: 'private key export seed old account' },
  { tab: 'privacy', anchor: 'active-sessions', label: 'Active sessions', labelKey: 'settings.activeSessions', keywords: 'devices logged in sign out revoke' },
  { tab: 'privacy', anchor: 'your-data', label: 'Your Data', labelKey: 'settings.yourData', keywords: 'export download import gdpr' },
  { tab: 'privacy', anchor: 'blocked-users', label: 'Blocked Users', keywords: 'block unblock mute' },
  { tab: 'privacy', anchor: 'geo-blocking', label: 'Geo-blocking', labelKey: 'settings.geoBlocking', keywords: 'country region restrict' },

  // Content
  { tab: 'content', anchor: 'content-post-visibility', label: 'Default Post Visibility', labelKey: 'settings.defaultPostVisibility', keywords: 'who can see posts' },
  { tab: 'content', anchor: 'auto-save-drafts', label: 'Auto-Save Drafts', labelKey: 'settings.autoSaveDrafts', keywords: 'drafts save' },
  { tab: 'content', anchor: 'mature-content', label: 'Show Mature Content', labelKey: 'settings.matureContent', keywords: 'nsfw adult sensitive explicit filter' },
  { tab: 'content', anchor: 'hide-watched', label: 'Hide watched videos', labelKey: 'settings.hideWatched', keywords: 'seen history feed' },
  { tab: 'content', anchor: 'skip-segments', label: 'Skip sponsors and intros', labelKey: 'settings.skipSegments', keywords: 'sponsorblock ads intro' },
  { tab: 'content', anchor: 'channel-speed', label: 'Playback speed per channel', labelKey: 'settings.channelSpeed', keywords: 'speed playback rate' },
  { tab: 'content', anchor: 'ad-load', label: 'Ads in your feed', labelKey: 'settings.adLoad', keywords: 'advertising frequency sponsored' },

  // Messages
  { tab: 'messages', anchor: 'allow-dms', label: 'Allow direct messages', labelKey: 'settings.allowDirectMessages', keywords: 'dm who can message inbox' },
  { tab: 'messages', anchor: 'message-fee', label: 'Message fee', labelKey: 'settings.messageFee', keywords: 'paid dm price dhb' },
  { tab: 'messages', anchor: 'free-dm-access', label: 'Free DM Access', labelKey: 'settings.freeAccessList', keywords: 'free list bypass fee' },
  { tab: 'messages', anchor: 'do-not-disturb', label: 'Do not disturb', labelKey: 'settings.doNotDisturb', keywords: 'dnd mute silence' },
  { tab: 'messages', anchor: 'message-notifications', label: 'Message Notifications', labelKey: 'settings.messageNotifications' },
  { tab: 'messages', anchor: 'read-receipts', label: 'Read Receipts', labelKey: 'settings.readReceipts', keywords: 'seen ticks' },
  { tab: 'messages', anchor: 'e2e-encryption', label: 'End-to-End Encryption', labelKey: 'settings.e2eEncryption', keywords: 'encrypted secure' },
  { tab: 'messages', anchor: 'filter-requests', label: 'Filter Message Requests', labelKey: 'settings.filterMessageRequests', keywords: 'spam requests' },
  { tab: 'messages', anchor: 'message-storage', label: 'Storage', labelKey: 'settings.storage', keywords: 'space used media' },
  { tab: 'messages', anchor: 'quick-actions', label: 'Quick Actions', labelKey: 'settings.quickActions', keywords: 'archive export chats' },

  // Assets
  { tab: 'assets', anchor: 'wallet-address', label: 'Wallet Address', keywords: 'address copy 0x' },
  { tab: 'assets', anchor: 'dhb-balance', label: 'DHB Balance', keywords: 'tokens coins balance' },
  { tab: 'assets', anchor: 'wallet', label: 'Wallet', keywords: 'wallet send receive' },
  { tab: 'assets', anchor: 'gas-fees', label: 'Gas Fees', keywords: 'gas sponsored transaction fees' },
  { tab: 'assets', anchor: 'tip-network', label: 'Tip network', keywords: 'tipping chain base bnb network' },
  { tab: 'assets', anchor: 'fractions', label: 'Fractions', labelKey: 'settings.fractionsOwn', keywords: 'shares owned' },
  { tab: 'assets', anchor: 'owned-usernames', label: 'Owned Usernames', labelKey: 'settings.usernamesOwn', keywords: 'handles marketplace' },
  { tab: 'assets', anchor: 'offers-made', label: 'Offers Made', labelKey: 'settings.offersMade', keywords: 'bids offers' },

  // Skills & characters
  { tab: 'skills', anchor: 'skills', label: 'Skills', labelKey: 'settings.skills', keywords: 'ai skills library' },
  { tab: 'characters', anchor: 'characters', label: 'Characters', labelKey: 'settings.characters', keywords: 'ai characters personas' },

  // Support
  { tab: 'support', anchor: 'report-bug', label: 'Report a Bug', labelKey: 'settings.reportBug', keywords: 'bug issue feedback support help' },
  { tab: 'support', anchor: 'terms', label: 'Terms of Service', labelKey: 'settings.termsOfService', keywords: 'terms legal' },
  { tab: 'support', anchor: 'privacy-policy', label: 'Privacy Policy', labelKey: 'settings.privacyPolicy', keywords: 'privacy legal' },
  { tab: 'support', anchor: 'delete-account', label: 'Delete account or data', labelKey: 'settings.deleteAccountData', keywords: 'delete close remove account gdpr' },
];

export interface SettingsSearchHit extends SettingsSearchEntry {
  /** The label as the reader sees it, in their language. */
  displayLabel: string;
}

/**
 * Rank matches so the closest label wins: a label that starts with the query
 * beats one that merely contains it, and both beat a keyword-only hit. Without
 * this, "the" surfaced "Theme" behind four unrelated rows and looked broken.
 */
export function searchSettings(query: string, t: TFunction, limit = 8): SettingsSearchHit[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const terms = trimmed.split(/\s+/).filter(Boolean);

  const scored: { hit: SettingsSearchHit; score: number; order: number }[] = [];

  SETTINGS_SEARCH_INDEX.forEach((entry, order) => {
    const displayLabel = entry.labelKey ? t(entry.labelKey, entry.label) : entry.label;
    const labels = [displayLabel.toLowerCase(), entry.label.toLowerCase()];
    const haystack = `${labels.join(' ')} ${(entry.keywords ?? '').toLowerCase()}`;

    // Every word typed has to land somewhere, so "message fee" doesn't match
    // every row with "message" in it.
    if (!terms.every((term) => haystack.includes(term))) return;

    let score = 4; // keyword-only hit
    for (const label of labels) {
      if (label === trimmed) score = Math.min(score, 0);
      else if (label.startsWith(trimmed)) score = Math.min(score, 1);
      else if (new RegExp(`\\b${escapeRegExp(trimmed)}`).test(label)) score = Math.min(score, 2);
      else if (label.includes(trimmed)) score = Math.min(score, 3);
    }

    scored.push({ hit: { ...entry, displayLabel }, score, order });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.hit);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------------ */
/* Reveal                                                                    */
/* ------------------------------------------------------------------------ */

const FLASH_CLASS = 'settings-reveal-flash';
/** How long the flash runs — must match the animation in index.css. */
const FLASH_MS = 2200;
/**
 * How long to keep looking for the anchor. A tab that has to fetch before it
 * renders (Profile blocks on the profile query) can take a second or two, and
 * a search hit that silently did nothing is the bug this whole file fixes.
 */
const WAIT_MS = 6000;

let revealToken = 0;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let flashed: HTMLElement | null = null;

/** Bottom edge of the sticky settings header, in viewport coordinates. */
function stickyHeaderBottom(): number {
  const header = document.querySelector<HTMLElement>('[data-feed-nav-outer]');
  if (!header) return 0;
  const style = getComputedStyle(header);
  if (style.position !== 'sticky' && style.position !== 'fixed') return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

function scrollAnchorIntoView(el: HTMLElement, smooth: boolean): void {
  const gap = stickyHeaderBottom() + 16;
  const delta = el.getBoundingClientRect().top - gap;
  if (Math.abs(delta) < 4) return;
  const top = Math.max(0, getDocumentScrollTop() + delta);
  if (smooth) scrollDocumentToSmooth(top);
  else scrollDocumentTo(top);
}

/**
 * Switch focus to one setting: scroll it clear of the sticky header and flash
 * it once. Safe to call before the tab holding it has mounted — it polls for
 * the anchor and gives up quietly if it never appears.
 */
export function revealSettingAnchor(anchor: string): void {
  if (typeof document === 'undefined') return;
  const token = ++revealToken;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const selector = `[data-setting-anchor="${anchor.replace(/"/g, '\\"')}"]`;
  const deadline = Date.now() + WAIT_MS;

  const attempt = () => {
    if (token !== revealToken) return;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      if (Date.now() < deadline) requestAnimationFrame(attempt);
      return;
    }

    scrollAnchorIntoView(el, !reducedMotion);
    // Tab content settles for a frame or two after mount (avatars, drawers,
    // the swallow clip re-measuring), which can leave the first scroll short.
    requestAnimationFrame(() => {
      if (token === revealToken) scrollAnchorIntoView(el, !reducedMotion);
    });
    setTimeout(() => {
      if (token === revealToken) scrollAnchorIntoView(el, !reducedMotion);
    }, 350);

    if (flashed) flashed.classList.remove(FLASH_CLASS);
    if (flashTimer) clearTimeout(flashTimer);
    // Restart the animation even when the same row is picked twice in a row.
    el.classList.remove(FLASH_CLASS);
    void el.offsetWidth;
    el.classList.add(FLASH_CLASS);
    flashed = el;
    flashTimer = setTimeout(() => {
      el.classList.remove(FLASH_CLASS);
      if (flashed === el) flashed = null;
      flashTimer = null;
    }, FLASH_MS);
  };

  requestAnimationFrame(attempt);
}
