/**
 * Follow Groups — editing
 * =======================
 * Create, rename, delete and file people into groups. Imported by the
 * Following list drawer and nothing on the boot path: the storage half lives
 * in `lib/follow-groups`, which is what the home feed reads, and the account
 * sync is registered once in ViewingPreferencesSync.
 *
 * Writes go to localStorage first and are pushed to the wallet's preference
 * blob after, so the picker never waits on a round trip.
 *
 * @module hooks/use-follow-groups
 */

import { useCallback } from 'react';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import {
  MAX_GROUPS,
  MAX_GROUP_NAME,
  newGroupId,
  readGroups,
  useFollowGroupList,
  writeGroups,
  type FollowGroup,
} from '@/lib/follow-groups';

export { MAX_GROUPS, MAX_GROUP_NAME, type FollowGroup } from '@/lib/follow-groups';

export function useFollowGroups() {
  const groups = useFollowGroupList();
  // setPref rather than useSyncedPreference: the blob is applied by
  // ViewingPreferencesSync, and registering the same key twice would just mean
  // two identical appliers racing to write the same localStorage entry.
  const prefs = useUserPreferences();

  const commit = useCallback((next: FollowGroup[]) => {
    writeGroups(next);
    prefs?.setPref('followGroups', next);
  }, [prefs]);

  const createGroup = useCallback((name: string, firstMember?: string) => {
    const clean = name.trim().slice(0, MAX_GROUP_NAME);
    if (!clean) return null;
    const current = readGroups();
    if (current.length >= MAX_GROUPS) return null;
    const group: FollowGroup = {
      id: newGroupId(),
      name: clean,
      members: firstMember ? [firstMember.toLowerCase()] : [],
    };
    commit([...current, group]);
    return group;
  }, [commit]);

  const renameGroup = useCallback((id: string, name: string) => {
    const clean = name.trim().slice(0, MAX_GROUP_NAME);
    if (!clean) return;
    commit(readGroups().map(g => (g.id === id ? { ...g, name: clean } : g)));
  }, [commit]);

  const deleteGroup = useCallback((id: string) => {
    commit(readGroups().filter(g => g.id !== id));
  }, [commit]);

  const toggleMember = useCallback((id: string, address: string) => {
    const addr = address.toLowerCase();
    commit(readGroups().map(g => {
      if (g.id !== id) return g;
      const has = g.members.includes(addr);
      return { ...g, members: has ? g.members.filter(m => m !== addr) : [...g.members, addr] };
    }));
  }, [commit]);

  return { groups, createGroup, renameGroup, deleteGroup, toggleMember };
}
