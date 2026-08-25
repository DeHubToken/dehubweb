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

/** Resolves once ICE gathering completes, or once the cap elapses. */
export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };

    pc.addEventListener('icegatheringstatechange', onChange);
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
