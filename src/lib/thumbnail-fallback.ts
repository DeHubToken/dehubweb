/**
 * Thumbnail fallback resolution
 * =============================
 * Shorts thumbnails moved CDN folder mid-history: older shorts live at
 * images/{tokenId}.jpg, newer ones at shorts/{tokenId}.jpg — and the API's
 * imageUrl field is unreliable in BOTH directions (it reports images/ for
 * files that only exist in shorts/, and vice versa). A wrong poster URL 403s
 * and the card renders as an empty black box, because <video poster> fires no
 * error event we could react to.
 *
 * So: probe the primary URL off-DOM once, and when it fails try the shorts/
 * sibling. Results are cached per URL for the session; a successful probe of
 * the primary doubles as a cache warm for the real poster fetch.
 */
import { useEffect, useState } from 'react';
import { cdnImage } from '@/lib/media-url';

/**
 * Raw primary URL → the raw URL that actually resolves.
 *
 * Keyed and stored WITHOUT the transform, because which folder a poster lives
 * in has nothing to do with what size it is being rendered at. Caching the
 * transformed URL instead (as this did originally) meant the first caller's
 * width was handed to every later one — so a 120 px reel tile and a full-width
 * feed card could not coexist.
 */
const resolved = new Map<string, string>();

/**
 * In-flight probes, so N cards sharing a poster — or one card asking for two
 * sizes of it — cost one probe rather than N.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * Fallback when a caller doesn't state a size. Video posters render anywhere
 * from a 120 px reel tile to a full-width feed card, so callers that know
 * their box should say so: `useResolvedThumbnail(url, deviceWidth(180))`.
 */
export const DEFAULT_POSTER_WIDTH = 1080;

function probe(url: string): Promise<boolean> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = url;
  });
}

/** images/{tokenId}.{ext} → its shorts/{tokenId}.jpg sibling, else null. */
function shortsSibling(url: string): string | null {
  const m = url.match(/^(.*\/)images\/(\d+)\.[a-zA-Z0-9-]+$/);
  return m ? `${m[1]}shorts/${m[2]}.jpg` : null;
}

/** Resolve which raw URL exists, probing at `width` so the probe warms the
 *  exact object the <img> will go on to request. */
function resolveRaw(url: string, width: number): Promise<string> {
  const cached = resolved.get(url);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(url);
  if (existing) return existing;

  const siblingRaw = shortsSibling(url);
  if (!siblingRaw) {
    // Nothing to fall back to — don't spend a probe on it.
    resolved.set(url, url);
    return Promise.resolve(url);
  }

  // Probe the TRANSFORMED urls, not the raw ones. The sibling logic still runs
  // on the raw path (that is where the images/ vs shorts/ folder lives), but
  // what gets probed has to be what actually gets fetched, or the comment
  // above stops being true — the probe would warm the raw object while the
  // <img> then requests a different URL. Cloudflare propagates the origin's
  // 403 for a missing source through the transform (verified against
  // production), so onerror still fires and the fallback still triggers.
  const run = (async () => {
    const winner = (await probe(cdnImage(url, { width })))
      ? url
      : (await probe(cdnImage(siblingRaw, { width })))
        ? siblingRaw
        : url;
    resolved.set(url, winner);
    inFlight.delete(url);
    return winner;
  })();
  inFlight.set(url, run);
  return run;
}

export async function resolveThumbnailUrl(
  url: string,
  width: number = DEFAULT_POSTER_WIDTH,
): Promise<string> {
  return cdnImage(await resolveRaw(url, width), { width });
}

/**
 * Returns the given thumbnail URL immediately, swapping to the shorts/
 * sibling if the primary turns out not to exist on the CDN.
 *
 * `width` is DEVICE pixels — pass `deviceWidth(cssPx)` so a reel tile asks for
 * a reel-tile-sized poster instead of a full-width one.
 */
export function useResolvedThumbnail(
  url: string | undefined | null,
  width: number = DEFAULT_POSTER_WIDTH,
): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(() =>
    url ? cdnImage(resolved.get(url) ?? url, { width }) : undefined,
  );

  useEffect(() => {
    if (!url) {
      setCurrent(undefined);
      return;
    }
    setCurrent(cdnImage(resolved.get(url) ?? url, { width }));
    let cancelled = false;
    void resolveRaw(url, width).then((winner) => {
      if (!cancelled) setCurrent(cdnImage(winner, { width }));
    });
    return () => {
      cancelled = true;
    };
  }, [url, width]);

  return current;
}
