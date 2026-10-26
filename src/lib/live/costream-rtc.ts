/**
 * Co-stream real-time link
 * ========================
 * The Agora channel a host and their guests talk on. Everyone publishes
 * their own camera and microphone and hears everyone else; the host's
 * browser additionally mixes the guests into the broadcast (guest-mixer.ts).
 *
 * The uid is the wallet's (costreamUid), which agora-token insists on for
 * these channels, so a remote uid always names a seat.
 */
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub/core';
import { costreamChannel, costreamUid } from '@/lib/live/costream-api';
import { createLogger } from '@/lib/logger';

const logger = createLogger('CoStreamRtc');

export interface RemoteMedia {
  uid: number;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoTrack: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audioTrack: any | null;
}

export interface CoStreamRtc {
  /** Replaces whatever this side is publishing. Null drops that kind. */
  publish: (video: MediaStreamTrack | null, audio: MediaStreamTrack | null) => Promise<void>;
  remotes: () => RemoteMedia[];
  onChange: (listener: () => void) => () => void;
  /** Local monitoring volume for one remote, 0-100. */
  setVolume: (uid: number, volume: number) => void;
  leave: () => Promise<void>;
}

export class CoStreamRtcError extends Error {
  constructor(message: string, readonly refused = false) { super(message); }
}

export async function joinCoStreamRtc(roomId: string, wallet: string): Promise<CoStreamRtc> {
  const channelName = costreamChannel(roomId);
  const uid = costreamUid(wallet);
  const token = getAuthToken();
  const { data, error } = await supabase.functions.invoke('agora-token', {
    body: { channelName, uid, role: 'publisher' },
    headers: token ? { 'x-dehub-token': token, 'x-wallet-address': wallet.toLowerCase() } : undefined,
  });
  if (error || data?.error || !data?.token || !data?.appId) {
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    throw new CoStreamRtcError(
      status === 403 ? 'You are not on this co-stream any more.' : 'Could not connect to the co-stream.',
      status === 403,
    );
  }

  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(3);
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  const remotes = new Map<number, RemoteMedia>();
  const volumes = new Map<number, number>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => { try { l(); } catch { /* listener's problem */ } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let local: { video: any | null; audio: any | null } = { video: null, audio: null };
  let left = false;
  // Clones do not follow the original's mute. The broadcaster mutes by
  // flipping `enabled` on its own track, so the copies are kept in step.
  let mirrored: Array<[MediaStreamTrack, MediaStreamTrack]> = [];
  const mirror = window.setInterval(() => {
    for (const [source, copy] of mirrored) if (copy.enabled !== source.enabled) copy.enabled = source.enabled;
  }, 400);

  const entry = (id: number): RemoteMedia => {
    let r = remotes.get(id);
    if (!r) {
      r = { uid: id, video: null, audio: null, videoTrack: null, audioTrack: null };
      remotes.set(id, r);
    }
    return r;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.on('user-published', async (user: any, kind: 'audio' | 'video') => {
    if (left) return;
    try {
      await client.subscribe(user, kind);
      if (left) return;
      const r = entry(Number(user.uid));
      if (kind === 'video') {
        r.videoTrack = user.videoTrack;
        r.video = user.videoTrack?.getMediaStreamTrack?.() ?? null;
      } else {
        r.audioTrack = user.audioTrack;
        r.audio = user.audioTrack?.getMediaStreamTrack?.() ?? null;
        user.audioTrack?.play();
        user.audioTrack?.setVolume?.(volumes.get(Number(user.uid)) ?? 100);
      }
      notify();
    } catch (err) {
      logger.warn('Co-stream subscribe failed', err);
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.on('user-unpublished', (user: any, kind: 'audio' | 'video') => {
    const r = remotes.get(Number(user.uid));
    if (!r) return;
    if (kind === 'video') { r.video = null; r.videoTrack = null; } else { r.audioTrack?.stop?.(); r.audio = null; r.audioTrack = null; }
    notify();
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.on('user-left', (user: any) => {
    remotes.get(Number(user.uid))?.audioTrack?.stop?.();
    remotes.delete(Number(user.uid));
    notify();
  });

  await client.join(data.appId, channelName, data.token, uid);

  const unpublishLocal = async () => {
    const tracks = [local.video, local.audio].filter(Boolean);
    if (tracks.length) await client.unpublish(tracks).catch(() => undefined);
    tracks.forEach((t) => { try { t.close(); } catch { /* closed */ } });
    local = { video: null, audio: null };
  };

  return {
    async publish(video, audio) {
      if (left) return;
      await unpublishLocal();
      // Clones: Agora stops the track it is handed when it closes, and these
      // belong to the broadcast.
      mirrored = [];
      const copy = (source: MediaStreamTrack) => {
        const clone = source.clone();
        mirrored.push([source, clone]);
        return clone;
      };
      const next = {
        video: video && video.readyState === 'live'
          ? AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: copy(video) })
          : null,
        audio: audio && audio.readyState === 'live'
          ? AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: copy(audio) })
          : null,
      };
      local = next;
      const tracks = [next.video, next.audio].filter(Boolean);
      if (tracks.length) await client.publish(tracks);
    },
    remotes: () => [...remotes.values()],
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setVolume(id, volume) {
      volumes.set(id, volume);
      remotes.get(id)?.audioTrack?.setVolume?.(volume);
    },
    async leave() {
      if (left) return;
      left = true;
      window.clearInterval(mirror);
      mirrored = [];
      await unpublishLocal();
      remotes.forEach((r) => r.audioTrack?.stop?.());
      remotes.clear();
      client.removeAllListeners();
      await client.leave().catch(() => undefined);
      notify();
    },
  };
}
