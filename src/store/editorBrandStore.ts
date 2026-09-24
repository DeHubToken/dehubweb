/**
 * Brand kit: colours, a heading and body font, and a logo from the media
 * library. Saved in this browser (every access is guarded: private mode or
 * blocked storage just means an unsaved kit). The AI agent reads it through
 * describeScene and uses it unless told otherwise.
 */
import { create } from 'zustand';

export interface BrandKit {
  colors: string[];
  /** CSS font-family values. */
  headingFont: string | null;
  bodyFont: string | null;
  logoMediaId: string | null;
}

const KEY = 'dehub.editor.brandKit.v1';
const EMPTY: BrandKit = { colors: [], headingFont: null, bodyFont: null, logoMediaId: null };
const MAX_COLORS = 10;

function load(): BrandKit {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<BrandKit>;
    return {
      colors: Array.isArray(v.colors) ? v.colors.filter((c) => typeof c === 'string').slice(0, MAX_COLORS) : [],
      headingFont: typeof v.headingFont === 'string' ? v.headingFont : null,
      bodyFont: typeof v.bodyFont === 'string' ? v.bodyFont : null,
      logoMediaId: typeof v.logoMediaId === 'string' ? v.logoMediaId : null,
    };
  } catch {
    return EMPTY;
  }
}

function save(kit: BrandKit) {
  try {
    localStorage.setItem(KEY, JSON.stringify(kit));
  } catch {
    /* storage unavailable: the kit lasts for this visit */
  }
}

interface BrandState {
  kit: BrandKit;
  update: (patch: Partial<BrandKit>) => void;
  addColor: (hex: string) => void;
  removeColor: (hex: string) => void;
}

export const useBrandStore = create<BrandState>((set, get) => ({
  kit: load(),
  update: (patch) => {
    const kit = { ...get().kit, ...patch };
    save(kit);
    set({ kit });
  },
  addColor: (hex) => {
    const c = hex.toLowerCase();
    const colors = [c, ...get().kit.colors.filter((x) => x !== c)].slice(0, MAX_COLORS);
    get().update({ colors });
  },
  removeColor: (hex) => get().update({ colors: get().kit.colors.filter((x) => x !== hex.toLowerCase()) }),
}));

export function hasBrand(kit: BrandKit): boolean {
  return kit.colors.length > 0 || !!kit.headingFont || !!kit.bodyFont || !!kit.logoMediaId;
}
