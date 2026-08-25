/**
 * WHIP publisher (WebRTC-HTTP Ingestion Protocol, RFC 9725)
 * =========================================================
 * Publishes a local MediaStream straight from the browser to Livepeer, so a
 * creator can go live from a webcam or a phone instead of installing OBS.
 *
 * The stream key is the same one the RTMP path already hands out — Livepeer
 * accepts either ingest against the same stream — so nothing on the DeHub
 * backend or the HLS playback side has to change. A stream published here
 * comes out of the same `playbackId` the feed cards already read.
 *
 * Protocol, in full:
 *   POST {base}/{streamKey}   Content-Type: application/sdp   body: SDP offer
 *     -> 201 Created, body: SDP answer, Location: session resource URL
 *   DELETE {resource}   ends the session
 *
 * Livepeer answers the POST with a 307 to a regional catalyst node. 307 (not
 * 302) is what the spec mandates precisely because it preserves the method and
 * body, so fetch's default redirect handling carries the offer through
 * untouched. The Location header may be relative, so it is resolved against
 * `response.url` — the URL *after* the redirect — not against the base.
 */

import { createLogger } from '@/lib/logger';
import { ICE_SERVERS, waitForIceGathering, resolveSessionResource } from './ice';

const logger = createLogger('WHIP');

/** Overridable so a self-hosted catalyst can be pointed at without a rebuild. */
const WHIP_BASE_URL =
  import.meta.env.VITE_LIVEPEER_WHIP_URL || 'https://livepeer.studio/webrtc';

export type WhipState =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export interface WhipSession {
  /** Tears down the peer connection and DELETEs the session resource. */
  stop: () => Promise<void>;
  /**
   * Swaps the outgoing track without renegotiating — this is how flipping the
   * camera or changing microphone mid-broadcast stays seamless. Passing null
   * mutes the sender at the transport level (viewers see a frozen frame /
   * silence) rather than dropping the track from the session.
   */
  replaceTrack: (kind: 'video' | 'audio', track: MediaStreamTrack | null) => Promise<void>;
}

export interface PublishOptions {
  streamKey: string;
  stream: MediaStream;
  /**
   * Full WHIP endpoint. Given, it is used verbatim; otherwise the Livepeer
   * base is joined with the stream key. The self-hosted ingest addresses a
   * stream by its PUBLIC playbackId, so the URL cannot be derived from the
   * key the way Livepeer's can.
   */
  endpoint?: string;
  /** Publish credential, sent as a bearer token. See live-ingest.ts. */
  token?: string;
  onStateChange?: (state: WhipState, detail?: string) => void;
}

/**
 * Put H.264 at the front of the video codec list.
 *
 * Livepeer transcodes H.264 natively; a VP8/VP9 ingest costs it an extra
 * decode step and, on some catalyst builds, is refused outright. Chrome offers
 * VP8 first by default, so left alone a Chrome broadcast negotiates the slow
 * path. This only reorders — every codec stays on offer, so a browser without
 * H.264 still connects.
 */
function preferH264(transceiver: RTCRtpTransceiver): void {
  if (typeof RTCRtpSender.getCapabilities !== 'function') return;
  if (typeof transceiver.setCodecPreferences !== 'function') return;

  const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
  if (!codecs?.length) return;

  const h264 = codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
  if (!h264.length) return;

  try {
    transceiver.setCodecPreferences([
      ...h264,
      ...codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264'),
    ]);
  } catch (e) {
    // Non-fatal: negotiation still succeeds on the browser's own ordering.
    logger.warn('setCodecPreferences failed, using default codec order', e);
  }
}

/**
 * Opens a WHIP session and starts sending `stream` to Livepeer.
 *
 * Resolves once the SDP exchange succeeds — which means the server accepted
 * the broadcast, not yet that media is flowing. Watch `onStateChange` for
 * `'live'`, which fires when the peer connection actually reaches `connected`.
 */
export async function publishToWhip({
  streamKey,
  stream,
  endpoint: endpointOverride,
  token,
  onStateChange,
}: PublishOptions): Promise<WhipSession> {
  if (!streamKey) throw new Error('A stream key is required to go live.');

  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    bundlePolicy: 'max-bundle',
  });

  let resourceUrl: string | null = null;
  let stopped = false;
  const transceivers: Partial<Record<'video' | 'audio', RTCRtpTransceiver>> = {};

  const replaceTrack = async (
    kind: 'video' | 'audio',
    track: MediaStreamTrack | null
  ): Promise<void> => {
    if (stopped) return;
    const sender = transceivers[kind]?.sender;
    if (!sender) return;
    await sender.replaceTrack(track);
  };

  const emit = (state: WhipState, detail?: string) => {
    if (stopped && state !== 'closed') return;
    onStateChange?.(state, detail);
  };

  emit('connecting');

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;

    // Close the peer connection first: it stops media immediately even if the
    // DELETE is slow or the network has already gone away.
    try {
      pc.close();
    } catch {
      /* already closed */
    }

    if (resourceUrl) {
      try {
        // keepalive lets the DELETE outlive a page being closed, so shutting
        // the tab ends the stream instead of stranding it until Livepeer's own
        // ingest timeout fires.
        await fetch(resourceUrl, { method: 'DELETE', keepalive: true });
        logger.info('WHIP session deleted');
      } catch (e) {
        // The stream still ends server-side once ingest stops; this is tidiness.
        logger.warn('WHIP DELETE failed; Livepeer will time the session out', e);
      }
    }

    onStateChange?.('closed');
  };

  try {
    // sendonly: this is an ingest, we never want a return path.
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      transceivers.video = pc.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [stream],
      });
      preferH264(transceivers.video);
    }
    if (audioTrack) {
      transceivers.audio = pc.addTransceiver(audioTrack, {
        direction: 'sendonly',
        streams: [stream],
      });
    }

    if (!videoTrack && !audioTrack) {
      throw new Error('No camera or microphone track to broadcast.');
    }

    pc.addEventListener('connectionstatechange', () => {
      switch (pc.connectionState) {
        case 'connected':
          emit('live');
          break;
        case 'disconnected':
          // Often transient (a network handover on mobile). WebRTC retries ICE
          // on its own, so report it without tearing the session down.
          emit('reconnecting');
          break;
        case 'failed':
          emit('failed', 'The connection to the streaming server was lost.');
          break;
        default:
          break;
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    const endpoint =
      endpointOverride || `${WHIP_BASE_URL.replace(/\/$/, '')}/${streamKey}`;
    logger.info('Posting WHIP offer', { endpoint });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: pc.localDescription?.sdp ?? '',
    });

    if (!response.ok) {
      throw new Error(
        `Streaming server rejected the broadcast (HTTP ${response.status}).`
      );
    }

    const answer = await response.text();
    if (!answer.trim()) throw new Error('Streaming server returned an empty answer.');

    // Resolve against response.url so a relative Location lands on the
    // regional catalyst we were redirected to, not on livepeer.studio.
    resourceUrl = resolveSessionResource(response);
    if (!resourceUrl) {
      // Without a resource URL we cannot DELETE; closing the peer connection
      // still ends the broadcast, Livepeer just reclaims it on its own timer.
      logger.warn('WHIP response had no Location header; teardown will rely on ICE timeout');
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    logger.info('WHIP negotiation complete', { hasResource: !!resourceUrl });

    return { stop, replaceTrack };
  } catch (error) {
    // Never leak a half-open peer connection or a live server-side session.
    await stop();
    throw error;
  }
}
