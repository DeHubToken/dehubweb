/**
 * Pictures from someone else's server are loaded through our API, never
 * straight from the viewer's browser.
 *
 * A link's share image, or a GIF URL in a message, can sit on a server the
 * sender runs. Loading it directly hands that server the viewer's IP address
 * and browser. Through `/api/image-proxy` it only ever sees our server.
 *
 * Our own CDN and big picture hosts that nobody can log from (Giphy, Tenor,
 * Google favicons, YouTube thumbnails) load directly.
 */
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';

const DIRECT_HOSTS = [
  'dehubcdn.ams3.digitaloceanspaces.com',
  'dehubcdn.ams3.cdn.digitaloceanspaces.com',
  'dehub.io',
  'riftn.com',
  'supabase.co',
  'giphy.com',
  'tenor.com',
  'gstatic.com',
  'ytimg.com',
  'ggpht.com',
  'googleusercontent.com',
  // Spotify cover art (Spotify cards): Spotify's own CDN.
  'scdn.co',
  'spotifycdn.com',
];

const PROXY_PREFIX = `${DEHUB_API_BASE}/api/image-proxy?url=`;

function isDirectHost(host: string): boolean {
  const h = host.toLowerCase();
  return DIRECT_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

export function outsideImage(src: string): string;
export function outsideImage(src: string | null | undefined): string | undefined;
export function outsideImage(src: string | null | undefined): string | undefined {
  if (!src) return src ?? undefined;
  if (src.startsWith(PROXY_PREFIX)) return src;
  if (!/^https?:\/\//i.test(src)) return src; // data:, blob:, relative
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return undefined;
  }
  if (isDirectHost(url.hostname)) return src;
  return PROXY_PREFIX + encodeURIComponent(url.toString());
}
