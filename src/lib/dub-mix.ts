import { useSyncExternalStore } from 'react';

export interface DubMix { voice: number; original: number }
export const DEFAULT_DUB_MIX: DubMix = { voice: 1, original: 0.1 };
const KEY = 'video-dub-mix';

function level(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
function read(): DubMix {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { voice: level(saved.voice, 1), original: level(saved.original, 0.1) };
  } catch { return { ...DEFAULT_DUB_MIX }; }
}
let current = read();
const listeners = new Set<() => void>();
export const getDubMix = () => current;
export function setDubMix(next: Partial<DubMix>): void {
  current = { voice: level(next.voice, current.voice), original: level(next.original, current.original) };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useDubMix = () => useSyncExternalStore(subscribe, getDubMix, () => DEFAULT_DUB_MIX);

/** Low control levels need finer gain steps than a linear amplitude slider. */
export const dubLevelGain = (value: number) => level(value, 0) ** 2;
export const dubVoiceVolume = (master: number) => level(master, 0) * dubLevelGain(current.voice);

export { applyVideoVolume, setDubMixActive } from './dub-volume';
