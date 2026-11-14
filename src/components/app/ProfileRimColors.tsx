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
 * the metallic white rim.
 */
const CACHE_KEY = 'dehub.rimColors.v2';
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

/** Metallic white / silver: the rim for signed-out people, no picture, or a
    picture with no clear colour of its own (most face photos). */
const METALLIC = ['240 240 246', '150 150 162', '215 215 226'];
const SHINE = '240 240 246';

/** Skin and warm beige read as salmon pink once lifted, which is what every
    face photo produced. They never count as the picture's colour. */
function isSkinLike(h: number, s: number, l: number): boolean {
  return (h <= 50 || h >= 345) && s < 0.8 && l > 0.2 && l < 0.88;
}

/**
 * Turn raw picture colours into rim colours that read on near-black. Only a
 * clear, non-skin colour counts; it is lifted to a bright tone and paired with
 * a white shine. A picture with no such colour gets the metallic rim. Always
 * returns three.
 */
function rimColorsFrom(hexes: string[]): string[] {
  const vivid = hexes
    .map(hexToRgb)
    .map(([r, g, b]) => rgbToHsl(r, g, b))
    .filter(([h, s, l]) => s >= 0.3 && l > 0.12 && l < 0.92 && !isSkinLike(h, s, l));
  if (vivid.length === 0) return METALLIC;
  const lift = ([h, s]: [number, number, number]) => hslToTriplet(h, Math.max(0.65, Math.min(0.95, s)), 0.64);
  return [lift(vivid[0]), SHINE, vivid[1] ? lift(vivid[1]) : lift(vivid[0])];
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
    extractBrandColors(url, 6)
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
