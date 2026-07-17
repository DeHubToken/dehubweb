import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEME_COLOR } from '@/lib/theme-color';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

const THEME_STORAGE_KEY = 'dehub.theme';
const DIM_LIGHTS_STORAGE_KEY = 'dehub.dimLights';
const DIM_STRENGTH_STORAGE_KEY = 'dehub.dimStrength';
const THEME_HUES_STORAGE_KEY = 'dehub.themeHues';
const BRAND_COLORS_STORAGE_KEY = 'dehub.brandColors';

// Dim overlay opacity range mapped from the 0–100 strength slider.
const DIM_MIN_OPACITY = 0.12;
const DIM_MAX_OPACITY = 0.72;
const DEFAULT_DIM_STRENGTH = 50;

// Built-in theme colour each customisable theme ships with. A value of 0–359
// is a hue; negative values are special modes (see THEME_COLOR). Cosmic ships
// as White to preserve its classic white/grey nebula look.
export const DEFAULT_THEME_HUES: Record<string, number> = {
  cosmic: THEME_COLOR.WHITE,
  hazy: 260,
  swarms: 200,
  lavalamp: 20,
};

/** Normalise a stored theme-colour value: hues wrap to 0–359, sentinels pass through. */
function normaliseThemeColor(value: number): number {
  if (value < 0) return Math.round(value);
  return ((Math.round(value) % 360) + 360) % 360;
}

type ThemeContextValue = {
  theme: string;
  setTheme: (value: string) => void;
  dimLights: boolean;
  setDimLights: (value: boolean) => void;
  /** Dim intensity as a 0–100 slider value. */
  dimStrength: number;
  setDimStrength: (value: number) => void;
  /** Resolved hue per customisable theme (user override or default). */
  themeHues: Record<string, number>;
  /** Set a theme's hue override; pass null to reset to the default. */
  setThemeHue: (theme: string, hue: number | null) => void;
  /**
   * Prominent colours (hex) extracted from the user's profile picture, used by
   * the Brand theme-colour mode. Shared across all themes and persisted.
   */
  brandColors: string[];
  /** Replace the stored brand palette (up to 3 hex colours). */
  setBrandColors: (colors: string[]) => void;
};

function readStoredBrandColors(): string[] {
  try {
    const raw = window.localStorage.getItem(BRAND_COLORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3);
  } catch {
    return [];
  }
}

function readStoredHues(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(THEME_HUES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = normaliseThemeColor(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    // Migrate old 'christmas' theme name to 'winter'.
    return stored === 'christmas' ? 'winter' : stored;
  });

  const [dimLights, setDimLightsState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DIM_LIGHTS_STORAGE_KEY) === '1';
  });

  const [dimStrength, setDimStrengthState] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_DIM_STRENGTH;
    const stored = Number(window.localStorage.getItem(DIM_STRENGTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.min(100, stored) : DEFAULT_DIM_STRENGTH;
  });

  const [hueOverrides, setHueOverrides] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    return readStoredHues();
  });

  const [brandColors, setBrandColorsState] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    return readStoredBrandColors();
  });

  // ---- Per-user sync bridges ------------------------------------------------
  // Each `apply` reconciles an inbound synced value onto local state + the local
  // localStorage key (instant paint). Each setter calls `push*` to persist the
  // change to the signed-in account. See UserPreferencesContext.
  const applyTheme = useCallback((v: unknown) => {
    let val = typeof v === 'string' && v ? v : 'system';
    if (val === 'christmas') val = 'winter';
    setThemeState(val);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, val); } catch { /* ignore */ }
  }, []);
  const { push: pushTheme } = useSyncedPreference('theme', theme, applyTheme, 'system');

  const applyDimLights = useCallback((v: unknown) => {
    const val = v === true || v === '1' || v === 1;
    setDimLightsState(val);
    try { window.localStorage.setItem(DIM_LIGHTS_STORAGE_KEY, val ? '1' : '0'); } catch { /* ignore */ }
  }, []);
  const { push: pushDimLights } = useSyncedPreference('dimLights', dimLights, applyDimLights, false);

  const applyDimStrength = useCallback((v: unknown) => {
    const n = Number(v);
    const val = Number.isFinite(n) && n > 0 ? Math.min(100, Math.max(0, Math.round(n))) : DEFAULT_DIM_STRENGTH;
    setDimStrengthState(val);
    try { window.localStorage.setItem(DIM_STRENGTH_STORAGE_KEY, String(val)); } catch { /* ignore */ }
  }, []);
  const { push: pushDimStrength } = useSyncedPreference('dimStrength', dimStrength, applyDimStrength, DEFAULT_DIM_STRENGTH);

  const applyThemeHues = useCallback((v: unknown) => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'number' && Number.isFinite(val)) out[k] = normaliseThemeColor(val);
      }
    }
    setHueOverrides(out);
    try { window.localStorage.setItem(THEME_HUES_STORAGE_KEY, JSON.stringify(out)); } catch { /* ignore */ }
  }, []);
  const { push: pushThemeHues } = useSyncedPreference('themeHues', hueOverrides, applyThemeHues, {});

  const applyBrandColors = useCallback((v: unknown) => {
    const clean = Array.isArray(v)
      ? v.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3)
      : [];
    setBrandColorsState(clean);
    try { window.localStorage.setItem(BRAND_COLORS_STORAGE_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  }, []);
  const { push: pushBrandColors } = useSyncedPreference('brandColors', brandColors, applyBrandColors, []);

  const setTheme = useCallback((value: string) => {
    setThemeState(value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore quota / private-mode errors
    }
    pushTheme(value);
  }, [pushTheme]);

  const setThemeHue = useCallback((themeName: string, hue: number | null) => {
    setHueOverrides((prev) => {
      const next = { ...prev };
      if (hue === null) {
        delete next[themeName];
      } else {
        next[themeName] = normaliseThemeColor(hue);
      }
      try {
        window.localStorage.setItem(THEME_HUES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / private-mode errors
      }
      pushThemeHues(next);
      return next;
    });
  }, [pushThemeHues]);

  const setBrandColors = useCallback((colors: string[]) => {
    const clean = colors.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3);
    setBrandColorsState(clean);
    try {
      window.localStorage.setItem(BRAND_COLORS_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // ignore quota / private-mode errors
    }
    pushBrandColors(clean);
  }, [pushBrandColors]);

  const setDimLights = useCallback((value: boolean) => {
    setDimLightsState(value);
    try {
      window.localStorage.setItem(DIM_LIGHTS_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore quota / private-mode errors
    }
    pushDimLights(value);
  }, [pushDimLights]);

  const setDimStrength = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    setDimStrengthState(clamped);
    try {
      window.localStorage.setItem(DIM_STRENGTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore quota / private-mode errors
    }
    pushDimStrength(clamped);
  }, [pushDimStrength]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.dimLights = dimLights ? 'true' : 'false';
  }, [dimLights]);

  useEffect(() => {
    const opacity = DIM_MIN_OPACITY + (DIM_MAX_OPACITY - DIM_MIN_OPACITY) * (dimStrength / 100);
    document.documentElement.style.setProperty('--dim-lights-opacity', opacity.toFixed(3));
  }, [dimStrength]);

  const themeHues = useMemo(() => ({ ...DEFAULT_THEME_HUES, ...hueOverrides }), [hueOverrides]);

  // Memoized: ThemeProvider wraps the whole app and its consumers include the
  // feed and every themed component — a fresh value literal re-renders them all.
  const value = useMemo(
    () => ({ theme, setTheme, dimLights, setDimLights, dimStrength, setDimStrength, themeHues, setThemeHue, brandColors, setBrandColors }),
    [theme, setTheme, dimLights, setDimLights, dimStrength, setDimStrength, themeHues, setThemeHue, brandColors, setBrandColors],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback so components don't crash if provider is missing.
    return {
      theme: 'system',
      setTheme: () => {},
      dimLights: false,
      setDimLights: () => {},
      dimStrength: DEFAULT_DIM_STRENGTH,
      setDimStrength: () => {},
      themeHues: { ...DEFAULT_THEME_HUES },
      setThemeHue: () => {},
      brandColors: [],
      setBrandColors: () => {},
    } as ThemeContextValue;
  }
  return ctx;
}
