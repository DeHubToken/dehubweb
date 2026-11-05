import { useEffect, useState } from 'react';

const PREFIX = 'riftn.shape.';

export function readShape(key: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * How many placeholder rows a list should show while it loads: as many as it
 * had last time (capped), or `fallback` on a first visit. Keeps the loading
 * shape the same size as what replaces it, so nothing below it jumps.
 */
export function useRememberedCount(key: string, count: number | null | undefined, fallback: number, max = 6): number {
  const [remembered] = useState(() => readShape(key));
  useEffect(() => {
    if (count == null) return;
    writeShape(key, Math.min(count, max));
  }, [key, count, max]);
  return Math.min(remembered ?? fallback, max);
}

export function writeShape(key: string, value: number): void {
  try { localStorage.setItem(PREFIX + key, String(Math.round(value))); } catch { /* private mode */ }
}
