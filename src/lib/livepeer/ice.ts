/**
 * ICE plumbing shared by the WHIP publisher and the WHEP subscriber.
 *
 * Both sides of Livepeer's WebRTC pair are non-trickle: the spec allows
 * trickling candidates over PATCH, but Livepeer accepts a complete offer and
 * that saves a round trip on every connect.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('ICE');

/**
 * Gathering usually finishes in a few hundred ms; this cap stops a network
 * that never reports `complete` (some corporate NATs, some mobile stacks) from
 * hanging forever. Whatever candidates exist at the cap are good enough.
 */
export const ICE_GATHERING_TIMEOUT_MS = 3000;

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** Short wait after the first useful candidate, so the rest of its round lands too. */
const ICE_ENOUGH_GRACE_MS = 150;

/** Resolves once ICE gathering completes, or once the cap elapses. */
export function waitForIceGathering(
  pc: RTCPeerConnection,
  /**
   * Stop early once a candidate of this type exists. `complete` waits for
   * every STUN server to answer, so one slow or blocked server costs the full
   * cap on every connect — why a live took seconds longer to start in a
   * browser than in the app. One reflexive (or relay) candidate is all the
   * far side needs.
   */
  enough?: RTCIceCandidateType,
): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onChange);
      pc.removeEventListener('icecandidate', onCandidate);
      clearTimeout(timer);
      clearTimeout(grace);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!enough || grace || event.candidate?.type !== enough) return;
      grace = setTimeout(finish, ICE_ENOUGH_GRACE_MS);
    };

    pc.addEventListener('icegatheringstatechange', onChange);
    pc.addEventListener('icecandidate', onCandidate);
    const timer = setTimeout(() => {
      logger.warn('ICE gathering timed out, continuing with the candidates gathered so far');
      finish();
    }, ICE_GATHERING_TIMEOUT_MS);
  });
}

/**
 * Livepeer answers with a 307 to a regional node, and the Location it returns
 * may be relative — so it resolves against the URL *after* the redirect, not
 * against the base that was posted to.
 */
export function resolveSessionResource(response: Response): string | null {
  const location = response.headers.get('Location');
  if (!location) return null;
  try {
    return new URL(location, response.url).toString();
  } catch {
    return null;
  }
}
