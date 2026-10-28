/**
 * Streams whose WebRTC answered but never sent a picture
 * ======================================================
 * Some broadcasts negotiate WebRTC fine and then deliver no frames (an
 * encoder setting WebRTC can't carry, a host whose media port is shut). The
 * player only learns that by waiting, and that wait sat in front of every
 * open of the stream. Once a stream has been silent on this device, skip
 * straight to HLS for a while; a stream that did play over WebRTC is
 * forgotten here so it gets the fast path again.
 */
const KEY = 'dehub.live.whepSilent';
const FORGET_AFTER_MS = 30 * 60_000;

type Silent = Record<string, number>;

function read(): Silent {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Silent) : {};
    const now = Date.now();
    for (const [id, at] of Object.entries(parsed)) if (now - at > FORGET_AFTER_MS) delete parsed[id];
    return parsed;
  } catch {
    return {};
  }
}

function write(next: Silent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode or storage off: every open just tries WebRTC again. */
  }
}

export function whepRecentlySilent(playbackId: string | null | undefined): boolean {
  return !!playbackId && playbackId in read();
}

export function rememberWhepSilent(playbackId: string | null | undefined) {
  if (!playbackId) return;
  write({ ...read(), [playbackId]: Date.now() });
}

export function forgetWhepSilent(playbackId: string | null | undefined) {
  if (!playbackId) return;
  const current = read();
  if (!(playbackId in current)) return;
  delete current[playbackId];
  write(current);
}

/** A real picture, not the 2x2 placeholder a silent WebRTC track reports. */
export function hasRealPicture(video: HTMLVideoElement): boolean {
  return video.videoWidth >= 16 && video.videoHeight >= 16;
}
