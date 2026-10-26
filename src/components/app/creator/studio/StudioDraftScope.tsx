import { Fragment, type ReactNode } from 'react';

export const studioSnapshotKey = (owner: string | null, scope = 'main') =>
  `dehub:creator-studio:v2:${owner?.toLowerCase() || 'guest'}:${encodeURIComponent(scope)}`;

export function readStudioSnapshot(key: string): string | null {
  try { return typeof window === 'undefined' ? null : window.localStorage.getItem(key); } catch { return null; }
}

export function writeStudioSnapshot(key: string, snapshot: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* Keep the live draft when device storage is unavailable. */ }
}

/** Remount all live composer state when its account or explicit workspace changes. */
export function StudioDraftScope({ owner, scope, children }: { owner: string | null; scope?: string; children: (storageKey: string) => ReactNode }) {
  const storageKey = studioSnapshotKey(owner, scope);
  return <Fragment key={storageKey}>{children(storageKey)}</Fragment>;
}
