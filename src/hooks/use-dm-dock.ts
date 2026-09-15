/**
 * DM Dock Registry
 * ================
 * Tracks the direct-message threads currently open as floating bottom-right
 * panels. Same window model as the post AI chat: opening a DM from a profile,
 * a store listing or a share sheet no longer throws the reader out of the page
 * they were on.
 */

import { useEffect, useState } from 'react';

export interface DockedDm {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  /** Typed into the composer but NOT sent — the welcome-message case. */
  draftBody?: string;
  /** Sent the moment the thread has a real id; fee-gated threads prefill instead. */
  autoSendBody?: string;
}

/** Three panels is all that fits beside the AI chats on a laptop. */
const MAX_OPEN = 3;

let dockedDms: DockedDm[] = [];
const listeners = new Set<(dms: DockedDm[]) => void>();

const keyOf = (address: string) => address.toLowerCase();

function notify() {
  listeners.forEach((listener) => listener([...dockedDms]));
}

/**
 * Open (or re-focus) a docked DM thread. Imperative on purpose — every caller
 * is a button somewhere in the tree, none of them own the panel.
 */
export function openDmDock(dm: DockedDm) {
  if (!dm.address) return;
  const key = keyOf(dm.address);
  if (dockedDms.some((d) => keyOf(d.address) === key)) {
    // Re-opening an already-docked thread carries the fresh draft/share body in.
    dockedDms = dockedDms.map((d) => (keyOf(d.address) === key ? { ...d, ...dm } : d));
  } else {
    dockedDms = [...dockedDms, dm].slice(-MAX_OPEN);
  }
  notify();
}

export function closeDmDock(address: string) {
  const key = keyOf(address);
  if (!dockedDms.some((d) => keyOf(d.address) === key)) return;
  dockedDms = dockedDms.filter((d) => keyOf(d.address) !== key);
  notify();
}

export function closeAllDmDocks() {
  if (dockedDms.length === 0) return;
  dockedDms = [];
  notify();
}

export function useDmDock() {
  const [dms, setDms] = useState<DockedDm[]>(dockedDms);

  useEffect(() => {
    const listener = (next: DockedDm[]) => setDms(next);
    listeners.add(listener);
    setDms([...dockedDms]);
    return () => { listeners.delete(listener); };
  }, []);

  return { dms, openDm: openDmDock, closeDm: closeDmDock, closeAll: closeAllDmDocks };
}
