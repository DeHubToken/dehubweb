/**
 * Shared colour model for the customisable WebGL themes (Cosmic, Hazy Nights,
 * Swarms). The theme colour is stored as a single number in `themeHues`:
 *
 *   0–359  → a normal hue on the spectrum slider
 *   -1     → White  (desaturated, bright)
 *   -2     → Black  (desaturated, near-black)
 *   -3     → Rainbow (full-spectrum cycling)
 *   -4     → Brand  (gradient built from the user's profile-picture colours)
 *
 * Encoding the special modes as negative sentinels keeps the stored schema a
 * plain number, so no localStorage migration is needed. Brand mode is the one
 * exception that also needs a palette: the extracted colours live separately
 * (see ThemeContext `brandColors`) and are threaded into resolveThemeColor().
 */

export const THEME_COLOR = {
  WHITE: -1,
  BLACK: -2,
  RAINBOW: -3,
  BRAND: -4,
} as const;

export type ThemeColorKind = 'hue' | 'white' | 'black' | 'rainbow' | 'brand';

/** An RGB colour with each channel in 0–1, as the shaders consume. */
export type Rgb = [number, number, number];

export interface ThemeColorSpec {
  kind: ThemeColorKind;
  /** Hue 0–359 (meaningful only when kind === 'hue'). */
  hue: number;
  /** Saturation 0–1 to feed a shader. */
  saturation: number;
  /** Baseline lightness 0–1 to feed a shader. */
  lightness: number;
  /** 1 when full-spectrum rainbow cycling should be enabled, else 0. */
  rainbow: number;
  /**
   * Brand palette (1–3 RGB colours, 0–1 channels) when kind === 'brand'.
   * Empty for every other kind. Shaders cycle a gradient across these the
   * same way rainbow cycles the spectrum.
   */
  brand: Rgb[];
}

export interface ThemeColorBaseline {
  /** Saturation a normal hue renders at for this theme. */
  saturation: number;
  /** Lightness a normal hue renders at for this theme. */
  lightness: number;
}

const DEFAULT_BASELINE: ThemeColorBaseline = { saturation: 0.7, lightness: 0.5 };

export function isSpecialThemeColor(value: number): boolean {
  return value < 0;
}

/**
 * Resolve a stored theme-colour number into concrete shader inputs.
 *
 * `brandColors` (hex strings) is only consulted for Brand mode. When Brand is
 * selected but no palette has been extracted yet, it degrades to rainbow so the
 * background never renders blank.
 */
export function resolveThemeColor(
  value: number,
  baseline: ThemeColorBaseline = DEFAULT_BASELINE,
  brandColors: string[] = [],
): ThemeColorSpec {
  switch (value) {
    case THEME_COLOR.WHITE:
      return { kind: 'white', hue: 0, saturation: 0, lightness: Math.max(baseline.lightness, 0.85), rainbow: 0, brand: [] };
    case THEME_COLOR.BLACK:
      return { kind: 'black', hue: 0, saturation: 0, lightness: 0.18, rainbow: 0, brand: [] };
    case THEME_COLOR.RAINBOW:
      return { kind: 'rainbow', hue: 0, saturation: Math.max(baseline.saturation, 0.85), lightness: baseline.lightness, rainbow: 1, brand: [] };
    case THEME_COLOR.BRAND: {
      const brand = brandColors
        .map(hexToRgb)
        .filter((c): c is Rgb => c !== null)
        .slice(0, 3);
      if (brand.length === 0) {
        // No palette extracted yet — behave like rainbow rather than blank.
        return { kind: 'rainbow', hue: 0, saturation: Math.max(baseline.saturation, 0.85), lightness: baseline.lightness, rainbow: 1, brand: [] };
      }
      // Derive a representative hue/sat/light from the dominant colour so any
      // consumer that ignores the palette still gets a sensible single tint.
      const [h, s, l] = rgbToHsl(brand[0]);
      return { kind: 'brand', hue: h * 360, saturation: s, lightness: l, rainbow: 0, brand };
    }
    default: {
      const hue = ((Math.round(value) % 360) + 360) % 360;
      return { kind: 'hue', hue, saturation: baseline.saturation, lightness: baseline.lightness, rainbow: 0, brand: [] };
    }
  }
}

/** Parse a #RGB / #RRGGBB string into an RGB triplet (0–1), or null if invalid. */
export function hexToRgb(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** RGB (0–1) → HSL (all channels 0–1). */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = ((h * 60) % 360 + 360) % 360 / 360;
  return [h, s, l];
}

/**
 * Sample a seamless, cyclic gradient across a brand palette. `t` (any real) is
 * wrapped into 0–1; the palette loops back to its first colour so the animated
 * cycle has no visible seam. Mirrors the GLSL `brandAt()` used in the shaders.
 */
export function sampleBrandGradient(colors: Rgb[], t: number): Rgb {
  const n = colors.length;
  if (n === 0) return [1, 1, 1];
  if (n === 1) return colors[0];
  const x = ((t % 1) + 1) % 1; // wrap to 0–1
  const seg = x * n; // 0..n
  const i = Math.floor(seg) % n;
  const f = seg - Math.floor(seg);
  const a = colors[i];
  const b = colors[(i + 1) % n];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** HSL (all channels 0–1) → RGB (0–1). Matches the shaders' hsl2rgb. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
