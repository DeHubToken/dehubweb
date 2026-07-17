/**
 * Connection-quality / data-saver hook
 * ====================================
 * Single source of truth for "should we serve the lightweight experience?".
 *
 * Sources, in order of authority:
 *   1. Manual override (localStorage `dehub_lite_mode`: 'on' | 'off' | 'auto').
 *      A user Data-Saver toggle writes this and dispatches `dehub:lite-change`.
 *   2. Auto-detect via the Network Information API — `saveData` (the browser's
 *      own Data Saver switch) or a truly slow `effectiveType` (2g/slow-2g).
 *
 * navigator.connection is Chromium/Android only (absent on iOS Safari), which is
 * fine: those users are exactly the slow-network cohort this targets, and the
 * manual toggle covers everyone else.
 *
 * @module hooks/use-connection-quality
 */

import { useEffect, useState } from 'react';

const LITE_KEY = 'dehub_lite_mode';
export const LITE_CHANGE_EVENT = 'dehub:lite-change';

type LitePref = 'on' | 'off' | 'auto';

interface ConnectionQuality {
  /** True when the network is metered/slow OR the user opted into Data Saver. */
  liteMode: boolean;
  /** Raw browser Data Saver flag. */
  saveData: boolean;
  /** '4g' | '3g' | '2g' | 'slow-2g' | undefined (unsupported). */
  effectiveType: string | undefined;
  /** Current manual preference. */
  pref: LitePref;
}

function readPref(): LitePref {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(LITE_KEY);
  return v === 'on' || v === 'off' ? v : 'auto';
}

function getConnection(): any {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
}

function compute(): ConnectionQuality {
  const pref = readPref();
  const conn = getConnection();
  const saveData: boolean = !!(conn && conn.saveData);
  const effectiveType: string | undefined = conn?.effectiveType;
  // Deliberately NOT treating '3g' as slow: Chrome buckets any ~270ms+ RTT
  // connection as "3g", which catches perfectly capable high-latency broadband
  // (e.g. users far from the origin) and silently killed video autoplay +
  // preload for them. Auto-lite is only for explicit Data Saver and true 2g.
  const autoSlow = saveData || effectiveType === '2g' || effectiveType === 'slow-2g';

  const liteMode = pref === 'on' ? true : pref === 'off' ? false : autoSlow;
  return { liteMode, saveData, effectiveType, pref };
}

/** Non-reactive one-shot read of the current Lite-mode verdict. */
export function getLiteMode(): boolean {
  return compute().liteMode;
}

/** Set (or clear) the manual Data-Saver override and notify all consumers. */
export function setLiteModePref(pref: LitePref): void {
  if (typeof localStorage === 'undefined') return;
  if (pref === 'auto') localStorage.removeItem(LITE_KEY);
  else localStorage.setItem(LITE_KEY, pref);
  window.dispatchEvent(new Event(LITE_CHANGE_EVENT));
}

export function useConnectionQuality(): ConnectionQuality {
  const [state, setState] = useState<ConnectionQuality>(compute);

  useEffect(() => {
    const update = () => setState(compute());
    const conn = getConnection();
    conn?.addEventListener?.('change', update);
    window.addEventListener(LITE_CHANGE_EVENT, update);
    window.addEventListener('storage', update); // sync across tabs
    return () => {
      conn?.removeEventListener?.('change', update);
      window.removeEventListener(LITE_CHANGE_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return state;
}
