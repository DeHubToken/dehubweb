/**
 * The playback id, pulled out of a Livepeer HLS URL.
 *
 * Its own module on purpose: the feed card needs this synchronously, on first
 * render, to decide whether a WebRTC attempt is even possible — while the WHEP
 * subscriber itself must stay off the boot path and load on demand. Importing
 * it from whep.ts would drag the whole peer-connection stack into first paint.
 */
export function playbackIdFromHlsUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/hls\/([^/?#]+)\//.exec(url);
  return match?.[1] ?? null;
}
