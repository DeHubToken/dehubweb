import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useIsDesktopViewport } from '@/hooks/use-is-desktop';
import { buildAvatarUrl, cdnImageSource } from '@/lib/media-url';
import { extractBrandColors } from '@/lib/brand-colors';

/**
 * System theme, computers: the side panels, top nav pill and search bar wear a
 * thin aurora rim tinted from the signed-in person's profile picture
 * (styles/system-rim.css). This writes the three rim colours onto <html> as
 * --rim-1..3 ("r g b"). With no picture, or signed out, the CSS falls back to
 * the default violet / sky / pink rim.
 */
const CACHE_KEY = 'dehub.rimColors';
const VARS = ['--rim-1', '--rim-2', '--rim-3'] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h = ((h * 60) % 360 + 360) % 360;
  return [h, s, l];
}

function hslToTriplet(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255)).join(' ');
}

/**
 * Turn raw picture colours into rim colours that read on near-black: vivid
 * hues are lifted to a bright, saturated tone; a black / white / grey picture
 * gets a silver rim instead of a muddy one. Always returns three.
 */
function rimColorsFrom(hexes: string[]): string[] {
  const hues = hexes
    .map(hexToRgb)
    .map(([r, g, b]) => rgbToHsl(r, g, b))
    .filter(([, s, l]) => s >= 0.18 && l > 0.08 && l < 0.95);
  if (hues.length === 0) return ['235 235 242', '150 150 162', '210 210 222'];
  const lift = ([h, s]: [number, number, number]) => hslToTriplet(h, Math.max(0.6, Math.min(0.95, s)), 0.66);
  const base = hues[0];
  const second = hues[1] ?? [(base[0] + 40) % 360, base[1], base[2]] as [number, number, number];
  const third = hues[2] ?? [(base[0] + 320) % 360, base[1], base[2]] as [number, number, number];
  return [lift(base), lift(second), lift(third)];
}

function readCache(url: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; colors?: unknown };
    return parsed.url === url && Array.isArray(parsed.colors) && parsed.colors.length === 3 ? (parsed.colors as string[]) : null;
  } catch { return null; }
}

function applyRim(colors: string[] | null) {
  const root = document.documentElement;
  VARS.forEach((v, i) => (colors ? root.style.setProperty(v, colors[i]) : root.style.removeProperty(v)));
}

export function ProfileRimColors() {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const isDesktop = useIsDesktopViewport();
  // Read the untransformed picture: the storage bucket answers cross-origin
  // reads for the site, the resize proxy in front of it does not.
  const url = user?.avatarImageUrl && user?.address ? cdnImageSource(buildAvatarUrl(user.address, user.avatarImageUrl) ?? '') : '';
  const active = isDesktop && theme === 'system';

  useEffect(() => {
    if (!active || !url) { applyRim(null); return; }
    const cached = readCache(url);
    if (cached) { applyRim(cached); return; }
    let cancelled = false;
    extractBrandColors(url, 3)
      .then(raw => {
        if (cancelled) return;
        const colors = rimColorsFrom(raw);
        applyRim(colors);
        try { window.localStorage.setItem(CACHE_KEY, JSON.stringify({ url, colors })); } catch { /* ignore */ }
      })
      .catch(() => { if (!cancelled) applyRim(null); });
    return () => { cancelled = true; };
  }, [active, url]);

  return null;
}
