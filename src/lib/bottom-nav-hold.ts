import { useEffect, useSyncExternalStore } from 'react';

/*
 * Pages with their own message box at the bottom (a community chat) ask the
 * phone bottom bar to stand down while they are on screen, so it never sits
 * over the box and its Send button.
 */
let holds = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useBottomNavHeld(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => holds > 0,
    () => false,
  );
}

export function useHoldBottomNav(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    holds += 1;
    emit();
    return () => { holds -= 1; emit(); };
  }, [enabled]);
}
