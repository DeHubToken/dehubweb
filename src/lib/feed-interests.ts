/**
 * Feed interests — the topics a new account picks while signing up
 * ================================================================
 * Picked on the "Your interests" step of the welcome flow and read back by
 * every category bar (home, videos, shorts, explore), which puts them first.
 *
 * Stored as `feedInterests` in the synced preferences blob
 * (`user_display_preferences.preferences`), so the choice follows the account
 * to other browsers and to the app, with a per-device localStorage copy for
 * the first paint. Values are category names exactly as /api/get_categories
 * returns them: lowercase, no `#`.
 *
 * @module lib/feed-interests
 */
import { useCallback, useSyncExternalStore } from 'react';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

export const FEED_INTERESTS_PREF = 'feedInterests';
const STORAGE_KEY = 'dehub.feedInterests';
const MAX_INTERESTS = 12;

export interface InterestTopic {
  /** Category name as the feed API spells it. */
  id: string;
  /** Artwork for the tile and the profile card banner, from /public. */
  cover?: string;
}

/**
 * The topics offered on the welcome step. Every id is a live category with
 * posts behind it (checked against /api/get_categories on 2026-10-27).
 */
export const INTEREST_TOPICS: readonly InterestTopic[] = [
  { id: 'music', cover: '/login-stack/concert.jpg' },
  { id: 'art', cover: '/login-stack/366621225937192975.jpg' },
  { id: 'gaming', cover: '/media/a4ae39d5-b2b6-4d79-a4d0-70101370ac82.png' },
  { id: 'crypto', cover: '/media/09d36738-4fac-4bec-93ca-12b75da186ae.png' },
  { id: 'sports', cover: '/login-stack/skate.jpg' },
  { id: 'travel', cover: '/login-stack/restyle.jpg' },
  { id: 'comedy', cover: '/login-stack/friends.jpg' },
  { id: 'film', cover: '/login-stack/898327456895946861.jpg' },
  { id: 'anime', cover: '/login-stack/693413673891637586.jpg' },
  { id: 'cars', cover: '/media/68257c55-c4a8-4aef-9df6-e6cb7c25b28e.png' },
  { id: 'podcast', cover: '/login-stack/bass.jpg' },
  { id: 'animals' },
  { id: 'tech' },
  { id: 'food' },
  { id: 'news' },
  { id: 'science' },
];

export function topicCover(id: string): string | undefined {
  return INTEREST_TOPICS.find((t) => t.id === id)?.cover;
}

function clean(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const name = v.trim().toLowerCase();
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

let current: string[] = (() => {
  try { return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { return []; }
})();
const listeners = new Set<() => void>();

function write(next: string[]) {
  current = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The account's picked interests, kept in step with the server copy. */
export function useFeedInterests(): string[] {
  const value = useSyncExternalStore(subscribe, () => current, () => current);
  const apply = useCallback((v: unknown) => write(clean(v)), []);
  useSyncedPreference(FEED_INTERESTS_PREF, value, apply, [] as string[]);
  return value;
}

/** Sets the interests on this device. The caller saves them to the account. */
export function setFeedInterests(next: string[]): string[] {
  const value = clean(next);
  write(value);
  return value;
}

/**
 * Picked interests first, in the order they were picked, then everything else
 * in the order it came. Matches on the lowercased name, which is what
 * getCategories normalises to.
 */
export function orderByInterests<T extends { name: string }>(categories: T[], interests: string[]): T[] {
  if (!interests.length || !categories.length) return categories;
  const rank = new Map(interests.map((name, i) => [name, i]));
  const picked: T[] = [];
  const rest: T[] = [];
  for (const c of categories) (rank.has(c.name.toLowerCase()) ? picked : rest).push(c);
  if (!picked.length) return categories;
  picked.sort((a, b) => (rank.get(a.name.toLowerCase()) ?? 0) - (rank.get(b.name.toLowerCase()) ?? 0));
  return [...picked, ...rest];
}
