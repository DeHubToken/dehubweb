/**
 * Real history navigation type
 * ============================
 * `useNavigationType()` from react-router is unusable in this app. App.tsx
 * renders `<Routes location={loc}>` (SurfaceTransition, so the exiting surface
 * can stay frozen on its old location during the app↔docs slide), and react-
 * router publishes a fresh LocationContext with `navigationType: POP` whenever
 * `<Routes>` is given an explicit location. Every consumer below that point
 * therefore reads "POP" forever — a PUSH-gated effect never fires, and a
 * POP-gated one always does.
 *
 * This hook derives the action the way react-router derives it internally:
 * from the `idx` counter it stores in `history.state`. Growing index = PUSH,
 * shrinking = POP, unchanged = REPLACE.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type HistoryNavType = 'PUSH' | 'POP' | 'REPLACE';

const readIdx = (): number => {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' ? idx : 0;
};

export function useHistoryNavType(): HistoryNavType {
  const location = useLocation();
  // First render is the initial load, which react-router also calls POP.
  const [navType, setNavType] = useState<HistoryNavType>('POP');
  const prevIdxRef = useRef(readIdx());
  const prevKeyRef = useRef(location.key);

  useEffect(() => {
    // `location.key` changes on REPLACE too, so it — not the index — is what
    // tells us a navigation happened at all.
    if (prevKeyRef.current === location.key) return;
    prevKeyRef.current = location.key;

    const idx = readIdx();
    const prevIdx = prevIdxRef.current;
    prevIdxRef.current = idx;

    setNavType(idx > prevIdx ? 'PUSH' : idx < prevIdx ? 'POP' : 'REPLACE');
  }, [location.key]);

  return navType;
}
