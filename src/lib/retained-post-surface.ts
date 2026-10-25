import { useSyncExternalStore } from 'react';

export type RetainedCommentsTab = 'replies' | 'quotes' | 'reposts' | 'search';
export interface RetainedPostEntry {
  id: string;
  container: HTMLDivElement;
  source: HTMLDivElement;
  dock: HTMLElement | null;
  restore: (() => void) | null;
  comments?: (tab: RetainedCommentsTab) => void;
  pendingComments?: RetainedCommentsTab;
}

const entries = new Map<string, Set<RetainedPostEntry>>();
let intendedEntry: RetainedPostEntry | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function retainedPostId(pathname: string): string | null {
  return pathname.match(/^\/(?:app\/)?post\/([^/]+)\/?$/)?.[1] ?? null;
}

export function getRetainedPost(id: string | null | undefined): RetainedPostEntry | null {
  if (!id) return null;
  const candidates = entries.get(id);
  if (!candidates) return null;
  return [...candidates].find(entry => entry.dock)
    ?? (intendedEntry && candidates.has(intendedEntry) && intendedEntry.source.isConnected ? intendedEntry : null)
    ?? [...candidates].find(entry => entry.source.isConnected) ?? null;
}

export function markRetainedPostIntent(entry: RetainedPostEntry) { intendedEntry = entry; }

export function useRetainedPost(id: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => getRetainedPost(id), () => null);
}

export function useRetainedPostPinned(id: string | number | null | undefined) {
  return useSyncExternalStore(subscribe, () => !!getRetainedPost(id == null ? null : String(id))?.dock, () => false);
}

export function registerRetainedPost(entry: RetainedPostEntry): () => void {
  const candidates = entries.get(entry.id) ?? new Set<RetainedPostEntry>();
  candidates.add(entry);
  entries.set(entry.id, candidates);
  notify();
  return () => {
    entry.restore?.();
    if (intendedEntry === entry) intendedEntry = null;
    candidates.delete(entry);
    if (!candidates.size) entries.delete(entry.id);
    entry.comments = undefined;
    entry.pendingComments = undefined;
    notify();
  };
}

/** Move the portal's existing target; changing a React portal target remounts its children. */
export function dockRetainedPost(entry: RetainedPostEntry, dock: HTMLElement): () => void {
  entry.restore?.();
  const height = entry.container.getBoundingClientRect().height;
  const previousHeight = entry.source.style.minHeight;
  entry.source.style.minHeight = `${height}px`;
  entry.dock = dock;
  dock.appendChild(entry.container);
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (entry.dock !== dock) return;
    entry.source.appendChild(entry.container);
    entry.source.style.minHeight = previousHeight;
    entry.dock = null;
    entry.restore = null;
    entry.comments = undefined;
    entry.pendingComments = undefined;
    notify();
  };
  entry.restore = restore;
  notify();
  return restore;
}

export function openRetainedComments(id: string, tab: RetainedCommentsTab = 'replies') {
  const entry = getRetainedPost(id);
  if (!entry?.dock) return;
  if (entry.comments) entry.comments(tab);
  else entry.pendingComments = tab;
}

export function bindRetainedComments(id: string, handler: (tab: RetainedCommentsTab) => void) {
  const entry = getRetainedPost(id);
  if (!entry?.dock) return () => {};
  entry.comments = handler;
  if (entry.pendingComments) {
    const tab = entry.pendingComments;
    entry.pendingComments = undefined;
    handler(tab);
  }
  return () => { if (entry.comments === handler) entry.comments = undefined; };
}
