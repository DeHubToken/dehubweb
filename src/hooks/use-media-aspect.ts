/**
 * useMediaAspect
 * ==============
 * Reports the real width/height ratio of a video, so a card can size itself to
 * the clip instead of forcing every post into a 16:9 box.
 *
 * Two sources, in order of trust:
 *
 * 1. The poster/thumbnail image. Thumbnails are extracted from the clip, so
 *    they carry its shape, and the probe resolves before the video is ever
 *    attached — the card lands on the right height on first paint instead of
 *    snapping once playback starts.
 * 2. The `<video>` element's intrinsic size, once metadata is in. Passed in by
 *    the caller and preferred whenever it is known.
 *
 * Results are cached per URL so one thumbnail is measured once across every
 * card and every navigation. The probe is a plain no-CORS `<img>` at the same
 * URL the card renders, so it is served from the browser cache rather than
 * costing a second download (unlike the CORS probe in use-blank-poster).
 */
import { useEffect, useState } from 'react';

const cache = new Map<string, number>();

/**
 * Ratios outside this band are clamped. The lower bound is full-height 9:16 —
 * a vertical clip fills the card as shot. The upper bound leaves room for
 * cinematic 2.39:1 without letting a stray measurement flatten a card to a
 * sliver.
 */
const MIN_RATIO = 9 / 16;
const MAX_RATIO = 2.4;

/** Every video falls back to this until something better is known. */
export const DEFAULT_ASPECT = 16 / 9;

export function clampAspect(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/**
 * @param posterUrl thumbnail to measure
 * @param intrinsic ratio read off the `<video>` once metadata loaded, if any
 * @returns a clamped width/height ratio, never null — 16:9 until measured
 */
export function useMediaAspect(posterUrl?: string | null, intrinsic?: number | null): number {
  const [posterRatio, setPosterRatio] = useState<number | null>(() =>
    posterUrl ? cache.get(posterUrl) ?? null : null,
  );

  useEffect(() => {
    if (!posterUrl) {
      setPosterRatio(null);
      return;
    }
    const cached = cache.get(posterUrl);
    if (cached !== undefined) {
      setPosterRatio(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) return;
      const ratio = w / h;
      cache.set(posterUrl, ratio);
      setPosterRatio(ratio);
    };
    // No handler on error: an unmeasurable poster just leaves the default.
    img.src = posterUrl;

    return () => {
      cancelled = true;
    };
  }, [posterUrl]);

  if (intrinsic && intrinsic > 0) return clampAspect(intrinsic);
  if (posterRatio) return clampAspect(posterRatio);
  return DEFAULT_ASPECT;
}
