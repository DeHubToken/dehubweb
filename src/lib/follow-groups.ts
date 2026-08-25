/**
 * Follow Groups — storage
 * =======================
 * Named subsets of the people you follow ("podcasts", "traders", "friends").
 * This half is deliberately tiny: the home feed reads groups to filter the
 * Following feed, and the home feed is on the boot path, so anything it pulls
 * in is downloaded and parsed before the first paint. Creating, renaming and
 * filing live in `hooks/use-follow-groups`, which only the Following list
 * drawer imports, and the account sync lives in ViewingPreferencesSync.
 *
 * Membership is by address, and the group is a view over the follow list
 * rather than a second copy of it — unfollowing someone drops them out of the
 * group view with nothing to clean up.
 *
 * @module lib/follow-groups
 */

import { useSyncExternalStore } from 'react';

export interface FollowGroup {
  id: string;
  name: string;
  /** Lowercased wallet addresses. */
  members: string[];
}

const STORAGE_KEY = 'follow-groups';
const CHANGE_EVENT = 'follow-groups-changed';

/** Keeps one group from swallowing the whole follow list by accident. */
export const MAX_GROUPS = 20;
export const MAX_GROUP_NAME = 24;

const EMPTY: FollowGroup[] = [];

/** Anything out of storage or off the wire goes through here before use. */
export function sanitiseGroups(value: unknown): FollowGroup[] {
  if (!Array.isArray(value)) return EMPTY;
  const groups: FollowGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Partial<FollowGroup>;
    const id = typeof raw.id === 'string' ? raw.id : '';
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!id || !name) continue;
    const members = Array.isArray(raw.members)
      ? Array.from(new Set(raw.members.filter((m): m is string => typeof m === 'string').map(m => m.toLowerCase())))
      : [];
    groups.push({ id, name: name.slice(0, MAX_GROUP_NAME), members });
    if (groups.length >= MAX_GROUPS) break;
  }
  return groups;
}

let cache: FollowGroup[] | null = null;

export function readGroups(): FollowGroup[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? sanitiseGroups(JSON.parse(raw)) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function writeGroups(groups: FollowGroup[]) {
  cache = groups;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {
    /* private mode / quota — the in-memory copy still serves this session */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const handler = () => { cache = null; onChange(); };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

// The subscribe handler drops the cache, so this re-parses once per change and
// then keeps returning the same array identity — a fresh array on every call
// would spin useSyncExternalStore forever.
function getSnapshot(): FollowGroup[] {
  return readGroups();
}

/** Read-only view of the groups, for the feed filter. */
export function useFollowGroupList(): FollowGroup[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
