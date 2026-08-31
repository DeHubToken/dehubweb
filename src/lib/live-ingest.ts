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
    // `/publish`, not `/whip`: nginx serves the same WHIP endpoint under both
    // names, and the client uses the one that client-side HTTPS filters do
    // not forge 403s for. Every field 403 arrived with zero packets at nginx,
    // MediaMTX or Cloudflare's edge while the same device's other POSTs to
    // the same hosts landed — something on the device kills URLs containing
    // /whip before they leave it.
    url: `https://${MEDIAMTX_HOST}/${stream.playbackId}/publish`,
    token: `dehub:${stream.streamKey ?? ''}`,
  };
}

/**
 * Whether this browser can reach the self-hosted ingest at all.
 *
 * The ingest is a bare droplet IP — the one DeHub host not behind Cloudflare,
 * because WebRTC cannot ride the proxy — and some ISPs null-route whole
 * hosting ranges, so a client there connects to everything except this. The
 * failure is a silent packet drop, which a fetch reports only by hanging, so
 * the probe caps its own wait. `no-cors` on purpose: any response at all,
 * opaque included, proves the network path; only a network error or the
 * timeout says it is closed. With no host configured the answer is true —
 * every stream is Livepeer then and the question never matters.
 */
/**
 * Why the last probe / TURN lookup failed, as `ErrorName: message`, empty
 * while none has. Kept as bare exports (this module must stay import-free —
 * boot path) so the go-live telemetry can report them: the field failure
 * under investigation is a browser whose probe and TURN fetches both die
 * while the SAME requests visibly arrive and get answered at nginx — the
 * error name is the only thing that distinguishes an abort from a network
 * throw from a response that never surfaced.
 */
export let lastProbeFailure = '';
export let lastTurnFailure = '';

const describeFailure = (error: unknown): string => {
  const e = error as { name?: string; message?: string } | null;
  return `${e?.name || 'Error'}: ${String(e?.message || '').slice(0, 120)}`;
};

export async function probeIngestReachable(timeoutMs = 4000): Promise<boolean> {
  if (!MEDIAMTX_HOST) return true;
  try {
    await fetch(`https://${MEDIAMTX_HOST}/`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    lastProbeFailure = '';
    return true;
  } catch (error) {
    lastProbeFailure = describeFailure(error);
    return false;
  }
}

/**
 * Memory of the last direct connect that died on the network, because a
 * passing probe is not proof. The DPI-throttled ISPs the probe exists for
 * intermittently let one small GET through while never carrying the WHIP
 * POST — a broadcaster there passes the probe, mints self-hosted, and dies
 * seconds later, identically on every retry (observed three times in six
 * minutes from one phone on 2026-08-31). So a network-shaped failure of a
 * DIRECT connect leaves a marker, the mint prefers Livepeer while one is
 * fresh, and a later successful direct connect clears it. A deployed TURN
 * relay outranks the marker at both decision points, exactly as it outranks
 * the probe. localStorage rather than component state so the marker survives
 * the reload-and-retry loop a stuck creator actually performs; every touch
 * is wrapped because Safari private mode throws on any storage access.
 */
const INGEST_FAILURE_KEY = 'dehub.ingest.unreachable-at';
const INGEST_FAILURE_WINDOW_MS = 24 * 3600 * 1000;

export function markIngestUnreachable(): void {
  try {
    localStorage.setItem(INGEST_FAILURE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the mint just falls back to trusting the probe */
  }
}

export function clearIngestUnreachable(): void {
  try {
    localStorage.removeItem(INGEST_FAILURE_KEY);
  } catch {
    /* nothing to clear where nothing could be written */
  }
}

export function hadRecentIngestFailure(): boolean {
  try {
    const at = Number(localStorage.getItem(INGEST_FAILURE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < INGEST_FAILURE_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * The same memory for the RELAYED path. The relay rides Cloudflare, and an
 * edge that refuses a client's SDP POST refuses it identically on every retry
 * (observed 2026-08-31: WHIP 403s that never reached nginx, from a phone
 * whose JSON API calls passed in the same minute). Without this record,
 * "a relay is deployed" permanently outvotes the device's own evidence that
 * the relay is unusable from where it stands — and the mint keeps sending a
 * blocked creator down the same dead end instead of falling back to Livepeer.
 */
// `.v2`: the relay endpoint changed shape (/whip → /publish), and every
// marker written before that was evidence against a URL the client no longer
// sends — a device that only ever failed on the filtered /whip path deserves
// a clean try at /publish rather than 24h steered away from a fixed route.
const RELAY_FAILURE_KEY = 'dehub.ingest.relay-failed-at.v2';

export function markRelayFailed(): void {
  try {
    localStorage.setItem(RELAY_FAILURE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the mint just falls back to trusting the probe */
  }
}

export function clearRelayFailed(): void {
  try {
    localStorage.removeItem(RELAY_FAILURE_KEY);
  } catch {
    /* nothing to clear where nothing could be written */
  }
}

export function hadRecentRelayFailure(): boolean {
  try {
    const at = Number(localStorage.getItem(RELAY_FAILURE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < INGEST_FAILURE_WINDOW_MS;
  } catch {
    return false;
  }
}

/** WHEP subscribe endpoint. Playback is ungated — watching costs no round-trip. */
export function whepEndpointFor(stream: LiveStreamRef): string | undefined {
  if (liveProviderOf(stream) !== 'mediamtx') return undefined;
  return `https://${MEDIAMTX_HOST}/${stream.playbackId}/whep`;
}

/**
 * Signaling relay for networks where the probe above fails.
 *
 * Rides api.dehub.io — Cloudflare-proxied, already in the CSP, and proven
 * reachable from the exact phones whose direct WHIP never arrived (their API
 * calls landed in the same minute). nginx forwards ONLY
 * /live-edge/{path}/(whip|whep) to MediaMTX's loopback signaling port; the
 * media itself never passes through it — a few KB of SDP text does, which is
 * why fronting it with the proxy is fine where fronting video is not.
 *
 * Signaling alone moves nothing: a network that cannot reach the ingest for
 * a POST usually cannot carry UDP media to it either. The relay path is only
 * whole once fetchTurnServers() below returns a relay for the media leg.
 */
const EDGE_SIGNALING_BASE = 'https://api.dehub.io/live-edge';

export function edgeWhipEndpointFor(
  stream: LiveStreamRef,
): { url?: string; token?: string } {
  if (liveProviderOf(stream) !== 'mediamtx') return {};
  return {
    // Same "/publish" naming as the direct host, for the same reason: the
    // path token /whip is what the on-device filters key on.
    url: `${EDGE_SIGNALING_BASE}/${stream.playbackId}/publish`,
    token: `dehub:${stream.streamKey ?? ''}`,
  };
}

export function edgeWhepEndpointFor(stream: LiveStreamRef): string | undefined {
  if (liveProviderOf(stream) !== 'mediamtx') return undefined;
  return `${EDGE_SIGNALING_BASE}/${stream.playbackId}/whep`;
}

/**
 * TURN relay servers for the media leg, or [] when no relay is deployed.
 *
 * The API answers with coturn REST credentials (expiry-stamp username, HMAC
 * credential, 6h TTL) and the relay URIs; an unconfigured backend answers an
 * empty list and callers skip the relay path entirely. Cached for the
 * session — the credential outlives any broadcast this tab will start, and
 * asking once keeps this safe to call at every decision point.
 */
let turnServersPromise: Promise<RTCIceServer[]> | null = null;

export function fetchTurnServers(): Promise<RTCIceServer[]> {
  if (!turnServersPromise) {
    turnServersPromise = (async () => {
      try {
        const res = await fetch('https://api.dehub.io/api/live/turn-credentials', {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          lastTurnFailure = `HTTP ${res.status}`;
          return [];
        }
        const body = (await res.json()) as { iceServers?: RTCIceServer[] };
        lastTurnFailure = '';
        return Array.isArray(body.iceServers) ? body.iceServers : [];
      } catch (error) {
        // A failed lookup must never break the direct path; it only means
        // "no relay available right now".
        lastTurnFailure = describeFailure(error);
        turnServersPromise = null;
        return [];
      }
    })();
  }
  return turnServersPromise;
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
