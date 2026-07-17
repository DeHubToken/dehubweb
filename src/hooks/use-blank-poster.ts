/**
 * useBlankPoster
 * ==============
 * Detects whether a video poster/thumbnail is a "blank" auto-extracted frame —
 * i.e. near-uniform in colour (a flat black / white / grey capture).
 *
 * Video thumbnails are grabbed from a frame of the clip. When the clip opens on
 * black, the captured frame is a valid-but-empty JPEG that renders as a solid
 * black box (see token 4909). We decode the poster onto a tiny canvas and flag
 * it when the luminance spread across the frame is near zero.
 *
 * - Returns `false` until a poster is proven blank, so real thumbnails never
 *   flash a fallback.
 * - Returns `false` on any load/CORS error (tainted canvas) so we never
 *   misclassify — the poster just behaves as it does today.
 * - Classification is cached per URL so each thumbnail is decoded once across
 *   every card and across navigations.
 */
import { useEffect, useState } from 'react';

const cache = new Map<string, boolean>();

/** Luminance spread below this (0–255) reads as a flat, contentless frame. */
const UNIFORM_THRESHOLD = 12;

export function useBlankPoster(url?: string | null): boolean {
  const [blank, setBlank] = useState<boolean>(() => (url ? cache.get(url) ?? false : false));

  useEffect(() => {
    if (!url) {
      setBlank(false);
      return;
    }
    const cached = cache.get(url);
    if (cached !== undefined) {
      setBlank(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onload = () => {
      if (cancelled) return;
      try {
        const w = 32;
        const h = 18;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          cache.set(url, false);
          setBlank(false);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let min = 255;
        let max = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Rec. 601 luma
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < min) min = lum;
          if (lum > max) max = lum;
        }
        const isBlank = max - min < UNIFORM_THRESHOLD;
        cache.set(url, isBlank);
        setBlank(isBlank);
      } catch {
        // Tainted canvas (missing CORS) or other read failure — do not flag.
        cache.set(url, false);
        setBlank(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setBlank(false);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return blank;
}
