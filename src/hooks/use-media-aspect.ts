import { LruCache } from '@/lib/lru-cache';
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
import { useEffect, useRef, useState } from 'react';
import { createMediaAspectCache } from '@/lib/media-aspect-cache';

const cache = new LruCache<string, number>(1000);
export const getMeasuredMediaAspect = (url?: string | null) => url ? cache.get(url) ?? null : null;
const videoAspects = createMediaAspectCache(
  () => localStorage.getItem('video-aspects-v1'), value => localStorage.setItem('video-aspects-v1', value),
);

export function rememberVideoAspect(key: string, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  videoAspects.set(key, ratio);
}

/**
 * Ratios outside this band are clamped. The lower bound is full-height 9:16 —
 * a vertical clip fills the card as shot. The upper bound leaves room for
 * cinematic 2.39:1 without letting a stray measurement flatten a card to a
 * sliver.
 */
const MIN_RATIO = 9 / 16;
const MAX_RATIO = 2.4;

/**
 * Floor for the post page, which shows a clip at its real shape however thin
 * it is. Still bounded so a bad measurement can't collapse the player to a line.
 */
export const THIN_MIN_RATIO = 1 / 5;

/** Every video falls back to this until something better is known. */
export const DEFAULT_ASPECT = 16 / 9;

export function clampAspect(ratio: number, minRatio: number = MIN_RATIO): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT;
  return Math.min(MAX_RATIO, Math.max(minRatio, ratio));
}

/**
 * @param posterUrl thumbnail to measure
 * @param intrinsic ratio read off the `<video>` once metadata loaded, if any
 * @param minRatio narrowest shape allowed; defaults to 9:16
 * @param stored width/height probed at upload (lib/video-aspect), used until measured
 * @returns a clamped width/height ratio, never null — 16:9 until measured
 */
export function useMediaAspect(
  posterUrl?: string | null,
  intrinsic?: number | null,
  minRatio: number = MIN_RATIO,
  mediaKey?: string,
  stored?: number | null,
): number {
  const [measured, setMeasured] = useState<{ url: string; ratio: number } | null>(null);
  const shown = useRef<{ key: string | null | undefined; ratio: number } | null>(null);
  const key = mediaKey ?? posterUrl;
  const posterRatio = posterUrl
    ? (measured?.url === posterUrl ? measured.ratio : cache.get(posterUrl) ?? null)
    : null;
  // The upload-time size wins over a poster that agrees with it within 2%, so a
  // re-encoded thumbnail a few pixels off never nudges the frame after paint.
  const storedRatio = stored && Number.isFinite(stored) && stored > 0 ? stored : null;
  const poster = posterRatio && storedRatio && Math.abs(posterRatio / storedRatio - 1) < 0.02 ? storedRatio : posterRatio;
  const known = intrinsic || (mediaKey ? videoAspects.get(mediaKey) : null) || poster || storedRatio;
  const ratio = known || (shown.current && shown.current.key === key ? shown.current.ratio : null);
  shown.current = ratio ? { key, ratio } : null;

  useEffect(() => {
    if (!posterUrl) {
      return;
    }
    const cached = cache.get(posterUrl);
    if (cached !== undefined) {
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
      setMeasured({ url: posterUrl, ratio });
    };
    // No handler on error: an unmeasurable poster just leaves the default.
    img.src = posterUrl;

    return () => {
      cancelled = true;
    };
  }, [posterUrl]);

  if (ratio) return clampAspect(ratio, minRatio);
  return DEFAULT_ASPECT;
}
