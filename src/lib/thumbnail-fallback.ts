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

const resolved = new Map<string, string>(); // raw primary URL → working TRANSFORMED URL

/**
 * Video posters render at anything from a 180px shorts tile to a full-width
 * feed card, so this matches the media default in media-url.ts rather than
 * trying to be clever. Cloudflare never upscales, so a smaller original is
 * untouched.
 */
const POSTER_WIDTH = 1080;

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

export async function resolveThumbnailUrl(url: string): Promise<string> {
  const cached = resolved.get(url);
  if (cached !== undefined) return cached;

  // Probe the TRANSFORMED urls, not the raw ones. The sibling logic still runs
  // on the raw path (that is where the images/ vs shorts/ folder lives), but
  // what gets probed has to be what actually gets fetched, or the comment
  // above stops being true — the probe would warm the raw object while the
  // <img> then requests a different URL. Cloudflare propagates the origin's
  // 403 for a missing source through the transform (verified against
  // production), so onerror still fires and the fallback still triggers.
  const primary = cdnImage(url, { width: POSTER_WIDTH });
  const siblingRaw = shortsSibling(url);
  if (!siblingRaw) {
    // Nothing to fall back to — don't spend a probe on it.
    resolved.set(url, primary);
    return primary;
  }
  const sibling = cdnImage(siblingRaw, { width: POSTER_WIDTH });
  const winner = (await probe(primary)) ? primary : (await probe(sibling)) ? sibling : primary;
  resolved.set(url, winner);
  return winner;
}

/**
 * Returns the given thumbnail URL immediately, swapping to the shorts/
 * sibling if the primary turns out not to exist on the CDN.
 */
export function useResolvedThumbnail(url: string | undefined | null): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(() =>
    url ? resolved.get(url) ?? cdnImage(url, { width: POSTER_WIDTH }) : undefined,
  );

  useEffect(() => {
    if (!url) {
      setCurrent(undefined);
      return;
    }
    setCurrent(resolved.get(url) ?? cdnImage(url, { width: POSTER_WIDTH }));
    let cancelled = false;
    void resolveThumbnailUrl(url).then((winner) => {
      if (!cancelled) setCurrent(winner);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return current;
}
