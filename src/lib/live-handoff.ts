/**
 * Live handoff
 * ============
 * Carries a playing WebRTC session from a feed card to the post page.
 *
 * Without it, opening a live post tore the feed's session down and the post
 * page negotiated a brand-new one: the picture went black, a spinner sat there
 * for as long as ICE + the WHEP round trip took, and then the stream came back.
 * The MediaStream is just a handle on the peer connection's tracks, so the post
 * page can put the same stream on its own <video> and keep going — no new
 * connection, no gap.
 *
 * Keyed by playbackId, which both sides derive from the same HLS URL. A stash
 * nobody claims (a different post was opened, the page never mounted a player)
 * is stopped after a short grace so it cannot hold a connection open.
 */

import type { WhepSubscription } from '@/lib/livepeer/whep';

interface LiveHandoff {
  session: WhepSubscription;
  /** The last frame the card showed, painted until the new element's first. */
  poster?: string;
  timer: ReturnType<typeof setTimeout>;
}

const UNCLAIMED_MS = 8000;
const pending = new Map<string, LiveHandoff>();

/** Grab the current frame so the post page never flashes black or a stock poster. */
function snapshot(video: HTMLVideoElement): string | undefined {
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return undefined;
    const scale = Math.min(1, 960 / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return undefined;
  }
}

export function stashLiveSession(playbackId: string, session: WhepSubscription, video: HTMLVideoElement) {
  const previous = pending.get(playbackId);
  if (previous) {
    clearTimeout(previous.timer);
    if (previous.session !== session) void previous.session.stop();
  }
  session.setStateListener(undefined);
  const timer = setTimeout(() => {
    if (pending.get(playbackId)?.session !== session) return;
    pending.delete(playbackId);
    void session.stop();
  }, UNCLAIMED_MS);
  pending.set(playbackId, { session, poster: snapshot(video), timer });
}

export function peekLiveSession(
  playbackId: string | null | undefined,
): { poster?: string } | null {
  const handoff = playbackId ? pending.get(playbackId) : undefined;
  return handoff ? { poster: handoff.poster } : null;
}

export function takeLiveSession(playbackId: string | null | undefined): WhepSubscription | null {
  if (!playbackId) return null;
  const handoff = pending.get(playbackId);
  if (!handoff) return null;
  clearTimeout(handoff.timer);
  pending.delete(playbackId);
  return handoff.session;
}
