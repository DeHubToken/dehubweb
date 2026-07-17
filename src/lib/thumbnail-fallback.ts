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

const resolved = new Map<string, string>(); // primary URL → working URL

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
  const sibling = shortsSibling(url);
  if (!sibling) {
    // Nothing to fall back to — don't spend a probe on it.
    resolved.set(url, url);
    return url;
  }
  const winner = (await probe(url)) ? url : (await probe(sibling)) ? sibling : url;
  resolved.set(url, winner);
  return winner;
}

/**
 * Returns the given thumbnail URL immediately, swapping to the shorts/
 * sibling if the primary turns out not to exist on the CDN.
 */
export function useResolvedThumbnail(url: string | undefined | null): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(() =>
    url ? resolved.get(url) ?? url : undefined,
  );

  useEffect(() => {
    if (!url) {
      setCurrent(undefined);
      return;
    }
    setCurrent(resolved.get(url) ?? url);
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
