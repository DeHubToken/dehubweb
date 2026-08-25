/**
 * Follow Groups
 * =============
 * Named subsets of the people you follow — "podcasts", "traders", "friends" —
 * and a filter for the Following feed built from them. Follow 200 accounts and
 * the Following feed is one undifferentiated stream; this is how you get at
 * the twelve you actually opened DeHub for.
 *
 * Groups live in the wallet's preference blob (the store the theme, autoplay
 * and hide-watched settings already use), so they follow the account to
 * another device. localStorage mirrors them for instant read and for the
 * moment before the blob hydrates.
 *
 * Membership is by address, and an address that is later unfollowed simply
 * stops appearing — the group is a view over the follow list, not a second
 * copy of it, so nothing has to be cleaned up when a follow ends.
 *
 * @module hooks/use-follow-groups
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

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

function parse(raw: string | null): FollowGroup[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return sanitise(parsed);
  } catch {
    return EMPTY;
  }
}

/** Anything off the wire or out of storage goes through here before use. */
export function sanitise(value: unknown): FollowGroup[] {
  if (!Array.isArray(value)) return EMPTY;
  const groups: FollowGroup[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof (entry as FollowGroup).id === 'string' ? (entry as FollowGroup).id : '';
    const name = typeof (entry as FollowGroup).name === 'string' ? (entry as FollowGroup).name.trim() : '';
    const rawMembers = (entry as FollowGroup).members;
    if (!id || !name) continue;
    const members = Array.isArray(rawMembers)
      ? Array.from(new Set(rawMembers.filter((m): m is string => typeof m === 'string').map(m => m.toLowerCase())))
      : [];
    groups.push({ id, name: name.slice(0, MAX_GROUP_NAME), members });
    if (groups.length >= MAX_GROUPS) break;
  }
  return groups;
}

let cache: FollowGroup[] | null = null;

function read(): FollowGroup[] {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(groups: FollowGroup[]) {
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

// The subscribe handler drops the cache, so getSnapshot re-parses once and
// then returns the same array identity until the next change — a fresh array
// on every call would spin useSyncExternalStore forever.
function getSnapshot(): FollowGroup[] {
  return read();
}

function newId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function useFollowGroups() {
  const groups = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const apply = useCallback((value: unknown) => {
    write(sanitise(value));
  }, []);
  const { push } = useSyncedPreference('followGroups', groups, apply, EMPTY);

  const commit = useCallback((next: FollowGroup[]) => {
    write(next);
    push(next);
  }, [push]);

  const createGroup = useCallback((name: string, firstMember?: string) => {
    const clean = name.trim().slice(0, MAX_GROUP_NAME);
    if (!clean) return null;
    const current = read();
    if (current.length >= MAX_GROUPS) return null;
    const group: FollowGroup = {
      id: newId(),
      name: clean,
      members: firstMember ? [firstMember.toLowerCase()] : [],
    };
    commit([...current, group]);
    return group;
  }, [commit]);

  const renameGroup = useCallback((id: string, name: string) => {
    const clean = name.trim().slice(0, MAX_GROUP_NAME);
    if (!clean) return;
    commit(read().map(g => (g.id === id ? { ...g, name: clean } : g)));
  }, [commit]);

  const deleteGroup = useCallback((id: string) => {
    commit(read().filter(g => g.id !== id));
  }, [commit]);

  const toggleMember = useCallback((id: string, address: string) => {
    const addr = address.toLowerCase();
    commit(read().map(g => {
      if (g.id !== id) return g;
      const has = g.members.includes(addr);
      return { ...g, members: has ? g.members.filter(m => m !== addr) : [...g.members, addr] };
    }));
  }, [commit]);

  /** Which groups an account belongs to — drives the row's group chips. */
  const groupsFor = useCallback((address?: string | null) => {
    const addr = (address ?? '').toLowerCase();
    if (!addr) return EMPTY;
    return read().filter(g => g.members.includes(addr));
  }, []);

  return { groups, createGroup, renameGroup, deleteGroup, toggleMember, groupsFor };
}

/** Member lookup for a single group, as a Set, for feed filtering. */
export function useGroupMemberSet(groupId: string | null): ReadonlySet<string> {
  const { groups } = useFollowGroups();
  return useMemo(() => {
    if (!groupId) return new Set<string>();
    const group = groups.find(g => g.id === groupId);
    return new Set(group?.members ?? []);
  }, [groups, groupId]);
}
