/**
 * Profile view mode
 * =================
 * The All tab on a profile shows posts as a grid of tiles or as the full
 * post list. The choice is the reader's, kept on this device, and shared by
 * the toolbar toggle and the tab that draws the posts.
 *
 * @module lib/profile-view-mode
 */

import { useSyncExternalStore } from 'react';

export type ProfileViewMode = 'grid' | 'list';

const KEY = 'dehub.profileView';
const listeners = new Set<() => void>();

function read(): ProfileViewMode {
  try {
    return window.localStorage.getItem(KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

let current: ProfileViewMode | null = null;

function snapshot(): ProfileViewMode {
  if (current === null) current = typeof window === 'undefined' ? 'grid' : read();
  return current;
}

export function setProfileViewMode(mode: ProfileViewMode): void {
  current = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useProfileViewMode(): ProfileViewMode {
  return useSyncExternalStore(subscribe, snapshot, () => 'grid');
}
