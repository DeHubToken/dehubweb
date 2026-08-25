/**
 * Where a given live stream's bytes come from.
 *
 * DeHub runs two ingests. Livepeer is the original; MediaMTX on our own
 * droplet is the cheap one — Livepeer bills delivery per viewer-hour, which is
 * the only part of the streaming bill that grows with an audience.
 *
 * The provider is read off the STREAM, never off the build. A deploy flag
 * would break every broadcast that was already running at cutover, and break
 * them again on rollback; a stream that carries its own provider survives
 * both. Streams that predate the field have none and are Livepeer by
 * definition, which is why the fallback here is a constant and not an env var.
 *
 * Kept free of imports on purpose. The feed card needs these URLs
 * synchronously on first render, the same reason `playback-id.ts` is its own
 * module — anything this file pulls in lands on the boot path.
 */

export type LiveProvider = 'livepeer' | 'mediamtx';

/** Host of the self-hosted ingest. No scheme — it is always HTTPS. */
const MEDIAMTX_HOST = import.meta.env.VITE_MEDIAMTX_HOST || '';

/** Just enough of a stream to resolve its URLs. */
export interface LiveStreamRef {
  provider?: string | null;
  playbackId?: string | null;
  streamKey?: string | null;
}

export function liveProviderOf(stream: LiveStreamRef | null | undefined): LiveProvider {
  return stream?.provider === 'mediamtx' && MEDIAMTX_HOST ? 'mediamtx' : 'livepeer';
}

/**
 * WHIP publish endpoint, plus the credential the self-hosted path needs.
 *
 * On MediaMTX the path is the playbackId — a value every viewer already has —
 * so the stream key travels as a credential instead of as the address. It goes
 * in a header rather than the query string so it stays out of access logs and
 * out of anything that records a URL. MediaMTX reads `user:pass` from a bearer
 * token precisely because some publishers (OBS) have only one field.
 */
export function whipEndpointFor(
  stream: LiveStreamRef,
): { url?: string; token?: string } {
  if (liveProviderOf(stream) !== 'mediamtx') return {};
  return {
    url: `https://${MEDIAMTX_HOST}/${stream.playbackId}/whip`,
    token: `dehub:${stream.streamKey ?? ''}`,
  };
}

/** WHEP subscribe endpoint. Playback is ungated — watching costs no round-trip. */
export function whepEndpointFor(stream: LiveStreamRef): string | undefined {
  if (liveProviderOf(stream) !== 'mediamtx') return undefined;
  return `https://${MEDIAMTX_HOST}/${stream.playbackId}/whep`;
}

/** HLS ladder — the fallback WHEP drops to, and what non-WebRTC clients get. */
export function hlsUrlFor(stream: LiveStreamRef): string | undefined {
  const playbackId = stream?.playbackId;
  if (!playbackId) return undefined;
  return liveProviderOf(stream) === 'mediamtx'
    ? `https://${MEDIAMTX_HOST}/${playbackId}/index.m3u8`
    : `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`;
}

/**
 * Poster frame. Livepeer renders one; MediaMTX does not, so a self-hosted
 * stream has no thumbnail and callers must fall back to the post's own image
 * rather than pointing an <img> at a 404.
 */
export function liveThumbnailFor(stream: LiveStreamRef): string | undefined {
  if (!stream?.playbackId) return undefined;
  if (liveProviderOf(stream) === 'mediamtx') return undefined;
  return `https://livepeercdn.studio/hls/${stream.playbackId}/thumbnail.jpg`;
}

/**
 * Recovers the provider and playback id from a stream's HLS URL.
 *
 * The feed threads exactly one playback value through its mappers — the HLS
 * URL — and the WebRTC route has always reused it rather than adding a second.
 * That stays true here, but the shape is no longer one shape: Livepeer puts
 * the id after `/hls/`, the self-hosted server puts it at the root of its own
 * host. A parser that knows only the first quietly returns null for every
 * self-hosted stream, and null means "no WebRTC available" — so the cheap
 * ingest would silently never use the sub-second path it exists to provide.
 */
export function liveSourceFromHlsUrl(
  url: string | undefined,
): { provider: LiveProvider; playbackId: string } | null {
  if (!url) return null;

  const livepeer = /\/hls\/([^/?#]+)\//.exec(url);
  if (livepeer?.[1]) return { provider: 'livepeer', playbackId: livepeer[1] };

  // Parsed rather than pattern-matched: the host is configuration, and a
  // hostname interpolated into a regex brings its own escaping problem for no
  // benefit when a URL parser answers the question directly.
  if (MEDIAMTX_HOST) {
    try {
      const parsed = new URL(url);
      if (parsed.host === MEDIAMTX_HOST) {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id) return { provider: 'mediamtx', playbackId: id };
      }
    } catch {
      // Not an absolute URL — nothing to resolve.
    }
  }

  return null;
}
