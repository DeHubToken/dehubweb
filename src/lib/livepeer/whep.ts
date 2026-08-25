/**
 * WHEP subscriber (WebRTC-HTTP Egress Protocol)
 * =============================================
 * Plays a Livepeer stream over WebRTC instead of HLS.
 *
 * HLS runs 10-20 seconds behind the broadcaster — it is a playlist of finished
 * segments, and the player needs a few of them buffered before it starts. That
 * delay is invisible on a recorded video and ruinous on a live one: a viewer
 * tips or asks a question about something that happened twenty seconds ago,
 * and the host answers into a room that has not seen it yet. WebRTC playback
 * lands around a second, which is what makes chat and tipping feel live.
 *
 * Same shape as the publisher in whip.ts, mirrored:
 *   POST {base}/{playbackId}   Content-Type: application/sdp   body: SDP offer
 *     -> 201 Created, body: SDP answer, Location: session resource URL
 *   DELETE {resource}   ends the session
 *
 * Not every stream can be played this way — a region without a nearby node, a
 * viewer behind a UDP-hostile network, an older recording — so callers must
 * keep the HLS path as a fallback rather than treating this as the only route.
 */

import { createLogger } from '@/lib/logger';
import { ICE_SERVERS, waitForIceGathering, resolveSessionResource } from './ice';

const logger = createLogger('WHEP');

/** Overridable so a self-hosted catalyst can be pointed at without a rebuild. */
const WHEP_BASE_URL =
  import.meta.env.VITE_LIVEPEER_WHEP_URL || 'https://livepeer.studio/webrtc';

export type WhepState = 'connecting' | 'playing' | 'reconnecting' | 'failed' | 'closed';

export interface WhepSubscription {
  /** Attach this to a <video> via srcObject. */
  stream: MediaStream;
  stop: () => Promise<void>;
}

export interface SubscribeOptions {
  playbackId: string;
  onStateChange?: (state: WhepState, detail?: string) => void;
}

/** Re-exported so callers that already import this module keep one import. */
export { playbackIdFromHlsUrl } from './playback-id';

export async function subscribeToWhep({
  playbackId,
  onStateChange,
}: SubscribeOptions): Promise<WhepSubscription> {
  if (!playbackId) throw new Error('A playback id is required to subscribe.');

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
  const stream = new MediaStream();
  let resourceUrl: string | null = null;
  let stopped = false;

  const emit = (state: WhepState, detail?: string) => {
    if (stopped && state !== 'closed') return;
    onStateChange?.(state, detail);
  };

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      pc.close();
    } catch {
      /* already closed */
    }
    if (resourceUrl) {
      try {
        await fetch(resourceUrl, { method: 'DELETE', keepalive: true });
      } catch {
        // The server times the session out on its own; this is tidiness.
      }
    }
    onStateChange?.('closed');
  };

  emit('connecting');

  try {
    // recvonly: this is playback, we never send anything back up.
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.addEventListener('track', (event) => {
      // One MediaStream for both tracks: handing a <video> element two
      // separate streams plays whichever arrived last and drops the other.
      stream.addTrack(event.track);
    });

    pc.addEventListener('connectionstatechange', () => {
      switch (pc.connectionState) {
        case 'connected':
          emit('playing');
          break;
        case 'disconnected':
          emit('reconnecting');
          break;
        case 'failed':
          emit('failed', 'The WebRTC playback connection was lost.');
          break;
        default:
          break;
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    const endpoint = `${WHEP_BASE_URL.replace(/\/$/, '')}/${playbackId}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp ?? '',
    });

    if (!response.ok) {
      throw new Error(`WebRTC playback unavailable (HTTP ${response.status}).`);
    }

    const answer = await response.text();
    if (!answer.trim()) throw new Error('The playback server returned an empty answer.');

    resourceUrl = resolveSessionResource(response);
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    logger.info('WHEP session opened', { playbackId });
    return { stream, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
