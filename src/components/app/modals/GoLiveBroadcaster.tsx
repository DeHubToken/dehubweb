/**
 * Go Live Broadcaster
 * ===================
 * The capture surface for browser-native livestreaming: grabs the webcam or a
 * screen share, publishes it to Livepeer over WHIP, and gives the creator the
 * controls they need while live. This is what removes the OBS requirement —
 * the RTMP credentials path still exists beside it for anyone running a real
 * encoder.
 *
 * Loaded dynamically by GoLiveModal so the WebRTC code only reaches people who
 * actually pick one of the browser capture options.
 */

import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  ScreenShare,
  ScreenShareOff,
  PictureInPicture2,
  Move,
  Wand2,
  MessageSquare,
  Users,
  Heart,
  Gift,
  Music,
  Loader2,
  AlertTriangle,
  Radio,
  SignalLow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  publishToWhip,
  WhipHttpError,
  type WhipHealth,
  type WhipSession,
  type WhipState,
} from '@/lib/livepeer/whip';
import {
  composeCameraBubble,
  BUBBLE_CORNERS,
  type BubbleCorner,
  type CameraBubble,
} from '@/lib/livepeer/compositor';
import { useVoiceEffects } from '@/hooks/use-voice-effects';
import type { VoiceEffectId } from '@/constants/voice-effects.constants';
import { VoiceEffectSelector } from '@/components/app/stages/VoiceEffectSelector';
import { SoundboardPanel } from '@/components/app/shared/SoundboardPanel';
import { DhbAmount } from '@/components/app/DhbAmount';
import { getLiveStream, updateStreamThumbnail } from '@/lib/api/dehub/livestream';
import { useQuery } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';
import {
  whipEndpointFor,
  edgeWhipEndpointFor,
  probeIngestReachable,
  fetchTurnServers,
  markIngestUnreachable,
  clearIngestUnreachable,
  hadRecentIngestFailure,
  markRelayFailed,
  clearRelayFailed,
} from '@/lib/live-ingest';

// The chat is a heavy component (mentions, voice notes, realtime) and most
// broadcasts never open it, so it stays out of the broadcaster chunk.
const LivePostChat = lazy(() =>
  import('@/components/app/cards/LivePostChat').then((m) => ({ default: m.LivePostChat }))
);

const logger = createLogger('GoLiveBroadcaster');

/**
 * How often the console asks the API for viewers, likes and tips.
 *
 * Deliberately unhurried: these are glanceable numbers on a panel the host has
 * open for an hour, and the alternative — the activity log — always returns
 * the OLDEST hundred entries ascending, so it freezes on a busy stream and
 * cannot be used as a live feed.
 */
const CONSOLE_POLL_MS = 15_000;

/*
 * When the outgoing picture counts as starved.
 *
 * Under about five frames a second a viewer is not watching a stream, they
 * are watching a slideshow; under ~150 kbit/s the encoder has given up on
 * the picture to protect the voice, which is what WebRTC does first. The
 * numbers are deliberately far below "not great" — this warning is for a
 * broadcast that is failing, not one that is merely soft.
 */
const STARVED_FPS = 5;
const STARVED_KBPS = 150;
/** Consecutive bad samples before it is called (3s each — see whip.ts). */
const STARVED_SAMPLES = 2;

/**
 * Poster-frame capture cadence.
 *
 * The first grab waits for the scene to settle — a camera opens on a dark,
 * still-exposing frame, and a screen share often opens on the picker's own
 * afterimage. After that it is slow on purpose: the point is a listing that
 * looks like the stream, not a live preview, and every capture is a round
 * trip the broadcast does not otherwise need.
 */
const POSTER_FIRST_DELAY_MS = 12_000;
const POSTER_INTERVAL_MS = 3 * 60_000;
/** Listings render this into an aspect-video card; the original is waste. */
const POSTER_WIDTH = 640;

interface GoLiveBroadcasterProps {
  streamKey: string;
  /**
   * Which ingest this stream lives on, and its public id. The self-hosted
   * path addresses a stream by playbackId and sends the key as a credential,
   * so the key alone is no longer enough to build the endpoint.
   */
  playbackId?: string;
  provider?: string;
  /**
   * A display capture taken in the modal, from the click that started go-live.
   * getDisplayMedia needs transient user activation and the mint that follows
   * runs 15-30s, so the picker cannot be opened from here on mount — a screen
   * broadcast has to arrive already captured. Null for a camera broadcast.
   */
  initialScreenStream?: MediaStream | null;
  /**
   * The Mongo ObjectId of the stream — what every /api/live/{id}/* route
   * takes, and never the NFT tokenId. Without it the console has no counts to
   * show and the chat has nothing to key on.
   */
  streamId?: string;
  /**
   * The POST's tokenId. Distinct from `streamId` above and not
   * interchangeable: the chat room is keyed on the post, because that is the
   * id the viewers' side has too.
   */
  tokenId?: string;
  /** Fired when the creator ends the broadcast; the parent runs API teardown. */
  onEnd: () => void;
  /**
   * Fired the first time the WHIP session actually reaches 'live'. The parent
   * uses it to tell a broadcast that aired apart from a launch that never did —
   * ending the latter discards its post instead of leaving a dead live card.
   */
  onLive?: () => void;
}

type Phase = 'starting' | 'connecting' | 'live' | 'reconnecting' | 'error';
type CaptureMode = 'camera' | 'screen';

/** 720p is the sweet spot: 1080p routinely exceeds a phone's upstream. */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

/**
 * The same 720p, stood on its end.
 *
 * A phone asked for 1280×720 hands back a landscape frame, so a creator
 * holding their phone upright published a wide picture with themselves in a
 * letterboxed strip down the middle — and every viewer got that shape too,
 * because what the camera captures is what goes on the wire. Asking for
 * 720×1280 on a portrait screen makes the broadcast the shape of the phone
 * that is filming it.
 */
const PORTRAIT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 720 },
  height: { ideal: 1280 },
  frameRate: { ideal: 30 },
};

/**
 * Read at capture time rather than once at module load: a phone rotated to
 * landscape mid-session should film landscape, and the constraint is only
 * consulted when a track is (re)opened.
 */
function cameraConstraints(): MediaTrackConstraints {
  if (typeof window === 'undefined') return VIDEO_CONSTRAINTS;
  const portrait = window.innerHeight > window.innerWidth;
  return portrait ? PORTRAIT_VIDEO_CONSTRAINTS : VIDEO_CONSTRAINTS;
}

/**
 * Screens ask for 1080p where the camera asks for 720p: a downscaled desktop
 * turns small text into mush, and the whole point of this path is showing a
 * game, a chart or an editor. WebRTC drops the bitrate on its own when the
 * uplink can't hold it, so the ceiling costs nothing on a weak connection.
 */
const SCREEN_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * The failure shapes that mean the network ate the request — the WHIP POST
 * aborted on its own cap, or died without ever getting a response — as
 * opposed to a camera or permission problem. One definition, because two
 * things key off it: the error copy must not blame the camera, and a direct
 * self-hosted connect dying this way leaves the unreachable marker that
 * steers the next mint to Livepeer.
 */
function isNetworkShapedError(error: unknown): boolean {
  const name = (error as DOMException)?.name;
  return name === 'TimeoutError' || name === 'AbortError' || error instanceof TypeError;
}

/**
 * Whether a publish attempt failed in a way that condemns the PATH rather
 * than the request. Network-shaped failures obviously qualify. So does an
 * HTTP refusal with any status our own ingest never sends: it answers 401
 * (bad key — the same credentials fail everywhere) and 406 (unsupported
 * media) and nothing else, so anything different came from a middlebox or
 * edge speaking in the server's place — observed as 403s that never reached
 * nginx. Those repeat identically on every retry, which is exactly what the
 * fallback markers exist to break.
 */
function isPathDeadError(error: unknown): boolean {
  if (isNetworkShapedError(error)) return true;
  return (
    error instanceof WhipHttpError && error.status !== 401 && error.status !== 406
  );
}

/**
 * How long after a publish is accepted a dead connection still means the media
 * never started, rather than a working broadcast that lost its network.
 *
 * Signaling and media do not travel together: the offer is an HTTPS POST, the
 * media is UDP to a bare address or a TURN relay. So the exchange can succeed
 * in full — 201, answer applied — on a network that then carries not one media
 * byte. That is not hypothetical: on 2026-08-31 the owner's own desktop
 * published to Livepeer cleanly and sent zero bytes, and the same shape
 * reproduced synthetically from that machine while every leg of the self-hosted
 * path verified from it. ICE gives up within roughly fifteen seconds of the
 * answer, so a failure inside this window is that; a failure after it is a live
 * broadcast dropping, which must never be restarted underneath the creator.
 */
const MEDIA_FAILURE_WINDOW_MS = 20_000;

/** Turns the DOM's terse permission errors into something a creator can act on. */
function describeMediaError(error: unknown): string {
  if (error instanceof WhipHttpError && isPathDeadError(error)) {
    return 'Something on this network blocked the broadcast. Tap Go Live again — the retry takes a different route.';
  }
  if (isNetworkShapedError(error)) {
    return 'Could not reach the streaming server. Check your connection or try again on another network (a VPN often helps).';
  }
  const name = (error as DOMException)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera and microphone access was blocked. Allow it in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera or microphone was found on this device.';
    case 'NotReadableError':
      return 'Your camera is already in use by another app. Close it and try again.';
    default:
      return error instanceof Error ? error.message : 'Could not start your camera.';
  }
}

interface AudioMix {
  ctx: AudioContext;
  track: MediaStreamTrack;
}

/**
 * WHIP publishes ONE audio track, but a screen share brings the tab's own
 * audio along beside the mic — and a game stream with no game audio is not a
 * game stream. Web Audio is the only way to sum two live tracks in a browser.
 *
 * Nothing here touches the mic's `enabled` flag: a disabled MediaStreamTrack
 * feeds silence into its source node, so the existing mute button goes on
 * working on the mic track while the system audio keeps flowing.
 */
function mixAudio(tracks: MediaStreamTrack[]): AudioMix | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor || tracks.length < 2) return null;

  try {
    const ctx = new Ctor();
    const destination = ctx.createMediaStreamDestination();
    tracks.forEach((track) => {
      ctx.createMediaStreamSource(new MediaStream([track])).connect(destination);
    });
    // Built after an await rather than inside the click, so the autoplay
    // policy can hand back a suspended context — which emits pure silence.
    void ctx.resume().catch(() => undefined);

    const track = destination.stream.getAudioTracks()[0] ?? null;
    if (!track) {
      void ctx.close().catch(() => undefined);
      return null;
    }
    return { ctx, track };
  } catch (error) {
    logger.warn('Audio mixing failed; publishing the microphone alone', error);
    return null;
  }
}

export function GoLiveBroadcaster({
  streamKey,
  playbackId,
  provider,
  initialScreenStream = null,
  streamId,
  tokenId,
  onEnd,
  onLive,
}: GoLiveBroadcasterProps) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [errorMessage, setErrorMessage] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [hasMic, setHasMic] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  // Seeded from the prop so the first paint already reads as a screen share
  // (no mirrored self-view frame, no "Starting camera…" on a desktop capture).
  const [captureMode, setCaptureMode] = useState<CaptureMode>(
    initialScreenStream ? 'screen' : 'camera'
  );
  // Preview mirroring keyed to what the TRACK reports, not what was requested:
  // facingMode is an ideal constraint, so "environment" can be satisfied by a
  // second front camera (two-webcam desktops) — which would un-mirror a
  // still-front-facing self-view if the requested value drove the transform.
  const [mirror, setMirror] = useState(!initialScreenStream);
  const [bubbleOn, setBubbleOn] = useState(false);
  const [bubbleCorner, setBubbleCorner] = useState<BubbleCorner>('bottom-right');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  /*
   * What viewers are actually receiving.
   *
   * The preview above is the camera, not the broadcast, so it stays flawless
   * while the encoder starves — and the host has no way to tell. On
   * 2026-09-01 a phone published 74 frames in 77 seconds at ~37 kbit/s and
   * its one viewer watched a frozen picture, left after seventeen seconds and
   * came back twice; the console showed a healthy stream throughout. Null
   * until the first sample lands, which is a couple of seconds after 'live'.
   */
  const [health, setHealth] = useState<WhipHealth | null>(null);
  const [starved, setStarved] = useState(false);
  // Only one drawer of extras at a time — the broadcast preview is the point
  // of this panel and two open boards would push it off a laptop screen.
  const [openPanel, setOpenPanel] = useState<'none' | 'voice' | 'sounds' | 'chat'>('none');
  const [effect, setEffect] = useState<VoiceEffectId>('none');
  const [switchingEffect, setSwitchingEffect] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<WhipSession | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // One lock for every video-source change — flip, share, unshare. Two of them
  // interleaving would swap tracks out from under each other and orphan a
  // capture (hardware light on, attached to nothing).
  const videoSwapRef = useRef(false);
  // micTrackRef is what gets PUBLISHED: the output of the voice-effect graph,
  // not the microphone itself. The raw capture is kept beside it because it is
  // the thing that must be stopped to release the hardware, and the thing the
  // mute button disables (muting the published track would take the soundboard
  // down with it).
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const rawMicStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const systemAudioRef = useRef<MediaStreamTrack | null>(null);
  const audioMixRef = useRef<AudioMix | null>(null);
  // The canvas composite and the webcam it draws, held apart from the published
  // stream: while the bubble is on, what goes out is the canvas, and both the
  // screen track and this camera are sources rather than senders.
  const bubbleRef = useRef<CameraBubble | null>(null);
  const bubbleCameraRef = useRef<MediaStreamTrack | null>(null);
  // The handed-over capture is consumed exactly once, on mount.
  const initialScreenRef = useRef<MediaStream | null>(initialScreenStream);
  // Mirrors for the async swap paths, which run long after their closures were
  // created and must not act on a stale toggle.
  const videoOnRef = useRef(true);
  const facingModeRef = useRef<'user' | 'environment'>('user');
  useEffect(() => { videoOnRef.current = videoOn; }, [videoOn]);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);
  // Read through a ref so the connect effect (whose dep list is deliberately
  // frozen) never restarts the ingest because the parent re-rendered.
  const onLiveRef = useRef(onLive);
  useEffect(() => { onLiveRef.current = onLive; }, [onLive]);

  /** Feature detection, not a device check: undefined on iOS and on Android. */
  const canShareScreen = typeof navigator?.mediaDevices?.getDisplayMedia === 'function';

  /*
   * Turns samples into a verdict.
   *
   * Two consecutive bad samples, not one: a keyframe request, a camera flip
   * and the first seconds after 'live' all dip briefly, and a warning that
   * blinks on every hiccup is one a host learns to ignore. Recovery is
   * immediate on the other hand — a stream that has come back should say so
   * at once.
   *
   * The first slide into starvation is logged at warn level so it reaches
   * client_error_logs. `limitation` is the part worth having: it separates
   * an uplink that cannot carry the picture from a phone that cannot encode
   * it, which no amount of reasoning from a bitrate alone can do.
   */
  const badSamplesRef = useRef(0);
  const reportedStarvedRef = useRef(false);
  const reportHealth = useCallback((sample: WhipHealth) => {
    setHealth(sample);

    // A camera the host deliberately switched off sends zero frames, which is
    // the same reading as a collapsed uplink and none of the same problem.
    const bad =
      videoOnRef.current && (sample.fps < STARVED_FPS || sample.videoKbps < STARVED_KBPS);
    badSamplesRef.current = bad ? badSamplesRef.current + 1 : 0;

    if (!bad) {
      reportedStarvedRef.current = false;
      setStarved(false);
      return;
    }
    if (badSamplesRef.current < STARVED_SAMPLES) return;

    setStarved(true);
    if (!reportedStarvedRef.current) {
      reportedStarvedRef.current = true;
      logger.warn('broadcast starved', {
        fps: sample.fps,
        videoKbps: sample.videoKbps,
        audioKbps: sample.audioKbps,
        limitation: sample.limitation,
        rttMs: sample.rttMs,
      });
    }
  }, []);
  // Held in a ref because the publish closure is built once per attempt and
  // must not be rebuilt (and the ingest restarted) when this identity changes.
  const reportHealthRef = useRef(reportHealth);
  useEffect(() => { reportHealthRef.current = reportHealth; }, [reportHealth]);

  /**
   * The room, from the host's side: who is watching, what they have given.
   * Until now the only way to see any of it was to open the post in a second
   * tab, which is also the only place the chat lived.
   */
  const { data: console_ } = useQuery({
    queryKey: ['broadcast-console', streamId],
    queryFn: () => getLiveStream(streamId as string),
    enabled: !!streamId && (phase === 'live' || phase === 'reconnecting'),
    refetchInterval: CONSOLE_POLL_MS,
    staleTime: CONSOLE_POLL_MS,
  });
  const room = console_?.result as
    | {
        totalViews?: number;
        peakViewers?: number;
        viewerCount?: number;
        likes?: number;
        totalTips?: number;
      }
    | undefined;

  /*
   * How many people are in the room right now.
   *
   * This used to read `peakViewers ?? totalViews` under the word "watching",
   * and neither is that. `peakViewers` is a high-water mark that only climbs;
   * `totalViews` counts JOINS, so one viewer whose connection drops and comes
   * back is two people, then three. On 2026-09-01 a host watched their
   * console say three while a single viewer reconnected twice — and read it
   * as an audience that could not see them.
   *
   * The socket carries the live figure and is the fast path; the poll now
   * carries `viewerCount` too, which seeds the number before anyone next
   * joins or leaves (the gateway only broadcasts on change).
   */
  const [liveViewers, setLiveViewers] = useState<number | null>(null);
  useEffect(() => {
    if (!streamId || (phase !== 'live' && phase !== 'reconnecting')) return;
    let cancelled = false;
    let presence: { leave: () => void } | null = null;

    import('@/lib/api/dehub/stream-presence')
      .then(({ watchStreamPresence }) => {
        if (cancelled) return;
        // Watch, never join: the host is not one of their own viewers, and
        // joining would inflate the very number this is here to report.
        presence = watchStreamPresence(streamId, (count) => {
          if (!cancelled) setLiveViewers(count);
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      presence?.leave();
    };
  }, [streamId, phase]);

  const watching = liveViewers ?? room?.viewerCount ?? 0;

  // The Stages voice-effect graph, reused as-is: mic → effect chain →
  // MediaStreamDestination. The broadcast publishes that destination rather
  // than the microphone, which is what lets effects switch and soundboard
  // clips mix in without the WHIP session noticing.
  const {
    processStream,
    rebuildEffect,
    cleanup: cleanupVoice,
    setRawMicEnabled,
    injectSound,
    stopInjectedSound,
    getProcessedStream,
  } = useVoiceEffects();

  const probeCameras = useCallback(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        setHasMultipleCameras(
          devices.filter((d) => d.kind === 'videoinput').length > 1
        );
      })
      .catch(() => undefined);
  }, []);

  // The mount-time probe runs before camera permission is granted, when
  // browsers report at most one placeholder device per kind — on a first-ever
  // broadcast it always says "one camera", hiding the flip button on the
  // phones it was built for. Re-probed after getUserMedia succeeds (when the
  // answer is real) and on devicechange.
  useEffect(() => {
    probeCameras();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener('devicechange', probeCameras);
    return () => md.removeEventListener('devicechange', probeCameras);
  }, [probeCameras]);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  // The browser silently releases the lock whenever the page is hidden, but
  // the sentinel object stays truthy — without tracking its 'release' event
  // the visibilitychange re-acquire below would short-circuit on the stale
  // ref and never request a new lock (the exact scenario it exists for).
  const acquireWakeLock = useCallback(async () => {
    try {
      const sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
      if (sentinel) {
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      }
      wakeLockRef.current = sentinel;
    } catch {
      /* Unsupported or denied — streaming still works, screen may sleep. */
    }
  }, []);

  /** Retires the composite and the webcam feeding it. Other inputs survive. */
  const releaseBubble = useCallback(() => {
    bubbleRef.current?.stop();
    bubbleRef.current = null;
    bubbleCameraRef.current?.stop();
    bubbleCameraRef.current = null;
  }, []);

  const teardown = useCallback(async () => {
    releaseWakeLock();
    releaseBubble();
    await sessionRef.current?.stop();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // The mic and the screen capture are held outside the published stream
    // (mixing replaces the published audio track with a synthesised one), so
    // they need retiring by hand or the hardware light stays on.
    micTrackRef.current?.stop();
    micTrackRef.current = null;
    // cleanupVoice closes the effect graph's context but never touches the
    // capture feeding it — the hardware is released here or not at all.
    cleanupVoice();
    rawMicStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawMicStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    systemAudioRef.current = null;
    audioMixRef.current?.track.stop();
    void audioMixRef.current?.ctx.close().catch(() => undefined);
    audioMixRef.current = null;
  }, [releaseWakeLock, releaseBubble, cleanupVoice]);

  /**
   * Captures the mic and runs it through the voice-effect graph. What comes
   * back is the graph's output — the track that gets published — and it is
   * also the destination the soundboard mixes clips into, which is why a
   * sound effect is heard by viewers even while the host is muted.
   *
   * A graph failure is survivable: fall back to the bare capture and lose the
   * effects rather than the broadcast.
   */
  const acquireMic = useCallback(
    async (existing?: MediaStream | null): Promise<MediaStreamTrack | null> => {
      // The camera path already prompted for audio alongside video and passes
      // that capture in; the screen path has to ask for the mic on its own.
      let raw = existing ?? null;
      if (!raw) {
        try {
          raw = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        } catch (error) {
          logger.warn('Microphone unavailable; broadcasting without it', error);
          return null;
        }
      }
      if (!raw.getAudioTracks().length) return null;
      rawMicStreamRef.current = raw;

      try {
        return await processStream(raw, 'none');
      } catch (error) {
        logger.warn('Voice effect graph failed; publishing the raw microphone', error);
        return raw.getAudioTracks()[0] ?? null;
      }
    },
    [processStream]
  );

  /**
   * Rebuilds the published audio from the sources that exist right now and
   * swaps it into the live session — mic alone, system audio alone, or the two
   * summed. Runs on every screen-share transition.
   *
   * Note the ceiling: WHIP only ever has the senders it was opened with, so a
   * broadcast that started with no audio at all (screen share, mic denied,
   * silent capture) cannot grow one later without a renegotiation.
   */
  const applySystemAudio = useCallback(async (systemTrack: MediaStreamTrack | null) => {
    const previous = audioMixRef.current;
    const mic = micTrackRef.current;
    // Remembered so a voice-effect switch, which produces a brand-new mic
    // track, can rebuild the same mix without being handed the share again.
    systemAudioRef.current = systemTrack;

    const mix = systemTrack && mic ? mixAudio([mic, systemTrack]) : null;
    audioMixRef.current = mix;
    const next = mix?.track ?? mic ?? systemTrack ?? null;

    await sessionRef.current?.replaceTrack('audio', next);

    // Keep the preview stream honest — teardown stops what it holds.
    const stream = streamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
      if (next) stream.addTrack(next);
    }

    // Only ever retires a synthesised mix; the mic and the system track are
    // owned by their capture and stopped with it.
    if (previous) {
      previous.track.stop();
      void previous.ctx.close().catch(() => undefined);
    }
  }, []);

  /**
   * Puts `track` on air and into the preview, retiring what it replaces.
   *
   * `stopPrevious` is off exactly once: switching the camera bubble on swaps
   * the canvas composite in while the screen track it is drawing from stays
   * live. Stopping it there would blank the very source being composited.
   */
  const swapVideoTrack = useCallback(
    async (track: MediaStreamTrack, stopPrevious = true): Promise<boolean> => {
      const stream = streamRef.current;
      const session = sessionRef.current;
      if (!stream || !session) return false;

      // Into the live session first so viewers never see a gap, then retire the
      // old track and splice the new one into the preview.
      await session.replaceTrack('video', track);

      const old = stream.getVideoTracks()[0];
      if (old) {
        stream.removeTrack(old);
        if (stopPrevious) old.stop();
      }
      stream.addTrack(track);
      track.enabled = videoOnRef.current;
      if (videoRef.current) videoRef.current.srcObject = stream;
      return true;
    },
    []
  );


  const releaseScreenCapture = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
  }, []);

  /**
   * Back to the webcam. Also the landing point for the browser's own "Stop
   * sharing" bar, which ends the track behind our back — so a machine with no
   * webcam has to degrade to a blanked sender rather than a frozen desktop
   * frame the creator can't see they're still publishing.
   */
  const stopScreenShare = useCallback(async () => {
    if (videoSwapRef.current) return;
    if (!streamRef.current || !sessionRef.current) return;
    videoSwapRef.current = true;

    let camera: MediaStreamTrack | null = null;
    try {
      // A live camera bubble is already holding a webcam. Promote it to the
      // full frame rather than prompting for a second one and leaving the
      // first running — claiming it here also keeps releaseBubble off it.
      const promoted = bubbleCameraRef.current;
      bubbleCameraRef.current = null;

      const capture = promoted
        ? null
        : await navigator.mediaDevices
            .getUserMedia({
              video: { ...cameraConstraints(), facingMode: facingModeRef.current },
              audio: false,
            })
            .catch(() => null);
      camera = promoted ?? capture?.getVideoTracks()[0] ?? null;

      // Teardown may have run while getUserMedia was prompting.
      if (!streamRef.current || !sessionRef.current) return;

      if (camera) {
        if (!(await swapVideoTrack(camera))) return;
        setMirror(camera.getSettings?.().facingMode !== 'environment');
        camera = null; // adopted into the stream — must not be stopped below
      } else {
        logger.warn('No camera to fall back to after screen sharing stopped');
        await sessionRef.current.replaceTrack('video', null);
        setVideoOn(false);
      }

      releaseBubble();
      setBubbleOn(false);
      await applySystemAudio(null);
      releaseScreenCapture();
      setCaptureMode('camera');
    } catch (error) {
      logger.warn('Returning to the camera failed', error);
    } finally {
      camera?.stop();
      videoSwapRef.current = false;
    }
  }, [swapVideoTrack, applySystemAudio, releaseScreenCapture, releaseBubble]);

  /** Ends the share when the creator uses the browser's own stop-sharing bar. */
  const watchForShareStop = useCallback(
    (track: MediaStreamTrack) => {
      track.addEventListener('ended', () => {
        logger.info('Screen share ended from the browser bar');
        void stopScreenShare();
      });
    },
    [stopScreenShare]
  );

  /**
   * Opens the picker and puts the chosen screen, window or tab on air. Safe to
   * call from the control bar because the click is its own user activation —
   * unlike mount, which is minutes past the one that started go-live.
   */
  const startScreenShare = useCallback(async () => {
    if (videoSwapRef.current) return;
    if (!streamRef.current || !sessionRef.current) return;
    videoSwapRef.current = true;

    let display: MediaStream | null = null;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: SCREEN_CONSTRAINTS,
        audio: true,
      });
      const track = display.getVideoTracks()[0] ?? null;
      if (!track) return;

      // Teardown, or an End Stream, may have run while the picker was open.
      if (!streamRef.current || !sessionRef.current) return;
      // Sharing implies showing: without this the swap would inherit a paused
      // video toggle and publish a black frame the controls claim is live.
      videoOnRef.current = true;
      if (!(await swapVideoTrack(track))) return;

      screenStreamRef.current = display;
      watchForShareStop(track);
      await applySystemAudio(display.getAudioTracks()[0] ?? null);

      setMirror(false);
      setVideoOn(true);
      setCaptureMode('screen');
      display = null; // adopted — must not be stopped below
    } catch (error) {
      // Dismissing the picker throws NotAllowedError; that is a normal "no".
      logger.info('Screen share not started', error);
    } finally {
      display?.getTracks().forEach((t) => t.stop());
      videoSwapRef.current = false;
    }
  }, [swapVideoTrack, applySystemAudio, watchForShareStop]);

  /**
   * The camera bubble: your face in the corner of the share, which is the
   * layout every game stream uses. WebRTC carries one video track per sender,
   * so the two captures are drawn into a canvas and the canvas is what gets
   * published — see lib/livepeer/compositor for the frame pump.
   */
  const toggleCameraBubble = useCallback(async () => {
    if (videoSwapRef.current) return;
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0] ?? null;
    if (!streamRef.current || !sessionRef.current || !screenTrack) return;
    videoSwapRef.current = true;

    let camera: MediaStreamTrack | null = null;
    try {
      if (bubbleRef.current) {
        // Back to the bare share. The screen track has been running underneath
        // the composite the whole time, so it goes straight back on air.
        if (!(await swapVideoTrack(screenTrack))) return;
        releaseBubble();
        setBubbleOn(false);
        return;
      }

      const capture = await navigator.mediaDevices
        .getUserMedia({
          video: { ...cameraConstraints(), facingMode: facingModeRef.current },
          audio: false,
        })
        .catch(() => null);
      camera = capture?.getVideoTracks()[0] ?? null;
      if (!camera) {
        logger.warn('No camera available for the bubble');
        return;
      }
      if (!streamRef.current || !sessionRef.current) return;

      const bubble = await composeCameraBubble({
        screen: screenTrack,
        camera,
        corner: bubbleCorner,
      });
      // stopPrevious is false here and nowhere else: the outgoing screen track
      // is the composite's own source and must keep running.
      if (!(await swapVideoTrack(bubble.track, false))) {
        bubble.stop();
        return;
      }

      bubbleRef.current = bubble;
      bubbleCameraRef.current = camera;
      camera = null; // owned by the bubble now
      setBubbleOn(true);
    } catch (error) {
      logger.warn('Camera bubble failed', error);
    } finally {
      camera?.stop();
      videoSwapRef.current = false;
    }
  }, [swapVideoTrack, releaseBubble, bubbleCorner]);

  const cycleBubbleCorner = useCallback(() => {
    const next =
      BUBBLE_CORNERS[(BUBBLE_CORNERS.indexOf(bubbleCorner) + 1) % BUBBLE_CORNERS.length];
    setBubbleCorner(next);
    // Applied straight to the running composite; the state is only for the UI.
    bubbleRef.current?.setCorner(next);
  }, [bubbleCorner]);

  // Start the capture, then open the ingest session. Every await below
  // re-checks `cancelled`, so an unmount mid-negotiation cleans up whatever
  // had been acquired by that point instead of stranding a live session.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const handed = initialScreenRef.current;
        // readyState guards the window between the modal's picker and this
        // mount: 15-30s of minting, during which the creator can hit the
        // browser's stop-sharing bar. A dead track means fall back to camera.
        const screenTrack =
          handed?.getVideoTracks().find((t) => t.readyState === 'live') ?? null;

        let videoTrack: MediaStreamTrack | null = null;
        let micTrack: MediaStreamTrack | null = null;
        let systemAudio: MediaStreamTrack | null = null;

        if (screenTrack) {
          screenStreamRef.current = handed;
          videoTrack = screenTrack;
          systemAudio = handed?.getAudioTracks()[0] ?? null;
          // A denied mic must not sink a screen share — the tab's own audio is
          // often the whole point. The camera path has no such fallback.
          micTrack = await acquireMic();
          if (cancelled) {
            micTrack?.stop();
            return;
          }
          setCaptureMode('screen');
          setMirror(false);
        } else {
          if (handed) handed.getTracks().forEach((t) => t.stop());
          const capture = await navigator.mediaDevices.getUserMedia({
            video: { ...cameraConstraints(), facingMode },
            audio: AUDIO_CONSTRAINTS,
          });
          if (cancelled) {
            capture.getTracks().forEach((t) => t.stop());
            return;
          }
          videoTrack = capture.getVideoTracks()[0] ?? null;
          // One prompt covers both permissions, so the audio half is handed
          // straight to the effect graph rather than captured a second time.
          const rawAudio = capture.getAudioTracks()[0] ?? null;
          micTrack = rawAudio ? await acquireMic(new MediaStream([rawAudio])) : null;
          if (cancelled) {
            capture.getTracks().forEach((t) => t.stop());
            micTrack?.stop();
            return;
          }
          setCaptureMode('camera');
          setMirror(videoTrack?.getSettings?.().facingMode !== 'environment');
          // Permission was just granted, so enumerateDevices now returns the
          // real device list — re-probe for the flip button.
          probeCameras();
        }

        micTrackRef.current = micTrack;
        systemAudioRef.current = systemAudio;
        setHasMic(!!micTrack);
        setMicOn(!!micTrack);

        const mix = systemAudio && micTrack ? mixAudio([micTrack, systemAudio]) : null;
        audioMixRef.current = mix;

        const stream = new MediaStream();
        if (videoTrack) stream.addTrack(videoTrack);
        const audioTrack = mix?.track ?? micTrack ?? systemAudio;
        if (audioTrack) stream.addTrack(audioTrack);

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        if (screenTrack) watchForShareStop(screenTrack);
        setPhase('connecting');

        // Decide direct vs relayed at connect time, not mint time — the
        // network the broadcast starts on is what matters, and a scheduled
        // stream can start long after it was created. Reachable ingest means
        // the probe answers in well under a second; only the blocked case
        // pays the cap, and it was going nowhere without this anyway. When
        // the ingest is unreachable AND a TURN relay is deployed, signaling
        // rides the api.dehub.io edge and media rides the relay; with no
        // relay the direct attempt proceeds and fails into the clear
        // network-error copy rather than silently.
        // Whether to relay is NOT gated on the probe. The probe false-passes
        // on the exact DPI networks the relay exists for — a tiny GET to the
        // ingest slips through intermittently while the WHIP POST never does
        // (observed: three go-lives that all probed "reachable", zero of which
        // ever reached nginx). So the relay is chosen on evidence that
        // survives that: a fresh record of the direct path failing ON THIS
        // DEVICE, or the probe actually admitting unreachability — and, either
        // way, a direct attempt that dies network-shaped is retried over the
        // relay before the creator sees an error.
        // A route can also die AFTER the server accepts the publish, when the
        // media leg never comes up — see MEDIA_FAILURE_WINDOW_MS. Both kinds of
        // death mean the same thing to this device, so both leave the same
        // marker and both get the same one retry over the other route.
        const directBits = whipEndpointFor({ provider, playbackId, streamKey });
        const relayBits = edgeWhipEndpointFor({ provider, playbackId, streamKey });
        const turnServers = directBits.url ? await fetchTurnServers() : [];
        if (cancelled) return;
        const canRelay = Boolean(relayBits.url) && turnServers.length > 0;
        const relayFirst =
          canRelay && (hadRecentIngestFailure() || !(await probeIngestReachable()));
        if (cancelled) return;
        // warn, not info, so it ships to the error log: the field failure
        // under investigation is a mediamtx stream publishing to the Livepeer
        // default, with every static layer verified correct — this line says
        // what the RUNTIME actually decided, and where provider stood.
        logger.warn('connect route', {
          provider: provider || '(empty)',
          direct: directBits.url || '(none)',
          relay: relayBits.url || '(none)',
          turnCount: turnServers.length,
          relayFirst,
        });

        // One media-leg recovery per broadcast. The two routes are the same
        // two the signaling fallback uses, and a route whose media has
        // already died is not worth a third attempt.
        let mediaRecoveryUsed = false;

        const openSession = async (viaRelay: boolean): Promise<WhipSession> => {
          const endpointBits = viaRelay ? relayBits : directBits;
          const relayIce = viaRelay ? turnServers : undefined;
          // Direct self-hosted signaling, no relay in front of it — the one
          // path whose success or failure teaches this device something.
          const directSelfHosted = Boolean(endpointBits.url) && !relayIce;
          // Per attempt, because the failure handler below has to tell "media
          // never started" from "media was flowing and stopped" for THIS
          // connection, and a recovery opens a second one behind it.
          let opened: WhipSession | null = null;
          let acceptedAt = 0;
          let sawLive = false;

          const session = await publishToWhip({
            streamKey,
            stream,
            // Named explicitly, NEVER spread: endpointBits carries `url`, but
            // publishToWhip's option is `endpoint` — `...endpointBits` passed
            // a key the function ignores, `endpoint` stayed undefined, and
            // EVERY self-hosted publish fell to the Livepeer default URL with
            // a key Livepeer had never heard of (the catalyst's 403 "Request
            // not allowed" seen on every failing device). A spread bypasses
            // the excess-property check, which is why typecheck never said a
            // word — the whole self-hosted browser publish path was dead from
            // the day it shipped.
            endpoint: endpointBits.url,
            token: endpointBits.token,
            iceServers: relayIce,
            onHealth: (sample) => {
              if (!cancelled) reportHealthRef.current(sample);
            },
            onStateChange: (state: WhipState, detail) => {
              if (cancelled) return;
              if (state === 'live') {
                sawLive = true;
                // A byte actually arrived: whatever this device remembered
                // about the path it just used being dead is stale.
                if (directSelfHosted) clearIngestUnreachable();
                else if (viaRelay && endpointBits.url) clearRelayFailed();
                setPhase('live');
                onLiveRef.current?.();
              } else if (state === 'reconnecting') setPhase('reconnecting');
              else if (state === 'failed') {
                // The server accepted the broadcast and the media never
                // followed. That condemns the ROUTE exactly as a refused POST
                // does, but the signaling side never sees it — which is how
                // this used to dead-end on an error screen with no marker and
                // no retry, leaving the creator to loop on the same dead path.
                const mediaDied =
                  !sawLive &&
                  acceptedAt > 0 &&
                  Date.now() - acceptedAt < MEDIA_FAILURE_WINDOW_MS;
                const mediaNeverStarted = Boolean(endpointBits.url) && mediaDied;
                if (mediaNeverStarted) {
                  if (viaRelay) markRelayFailed();
                  else markIngestUnreachable();
                  const other = !viaRelay;
                  const otherIsOpen = other ? canRelay : Boolean(directBits.url);
                  if (!mediaRecoveryUsed && otherIsOpen) {
                    mediaRecoveryUsed = true;
                    void recoverMediaOver(opened, other);
                    return;
                  }
                } else if (mediaDied) {
                  // The LIVEPEER escape hatch died at its media leg. That is
                  // evidence the refuge does not work from here — so forget
                  // whatever this device remembered against the self-hosted
                  // routes, or the unreachable marker locks it onto a Livepeer
                  // that can never carry its video for the rest of the 24h
                  // window (observed: a creator looping on dead Livepeer
                  // mints while the ingest answered their probes fine).
                  clearIngestUnreachable();
                  clearRelayFailed();
                }
                setPhase('error');
                setErrorMessage(
                  mediaDied
                    ? 'This network blocked the video from leaving your device. Tap Go Live again — the retry takes a different route.'
                    : detail || 'The broadcast connection failed.'
                );
                // Nothing left to try, so holding the camera, mic and wake lock
                // on a dead error screen is pure leak (hardware light on, phone
                // kept awake). Stop the local capture; the End button still
                // runs the backend teardown.
                void teardown();
              }
            },
          });
          acceptedAt = Date.now();
          opened = session;
          return session;
        };

        /**
         * Move a dead media leg onto the other route.
         *
         * Only the WHIP session is retired — the camera, the microphone and the
         * effect graph are left exactly as they are, so the creator sees
         * "Connecting…" again rather than a restarted preview and a second
         * permission prompt. openSession above reaches forward to this; the two
         * are mutually recursive by one hop and the order cannot satisfy both.
         */
        const recoverMediaOver = async (
          dead: WhipSession | null,
          viaRelay: boolean
        ): Promise<void> => {
          setPhase('connecting');
          await dead?.stop().catch(() => undefined);
          if (sessionRef.current === dead) sessionRef.current = null;
          if (cancelled) return;
          try {
            const next = await openSession(viaRelay);
            if (cancelled) {
              await next.stop();
              return;
            }
            sessionRef.current = next;
            await acquireWakeLock();
          } catch (error) {
            logger.error('Media fallback failed', { viaRelay }, error);
            if (isPathDeadError(error)) {
              if (viaRelay) markRelayFailed();
              else markIngestUnreachable();
            }
            if (cancelled) return;
            setPhase('error');
            setErrorMessage(describeMediaError(error));
            void teardown();
          }
        };

        let session: WhipSession;
        try {
          session = await openSession(relayFirst);
        } catch (error) {
          // Only a self-hosted attempt that died path-shaped teaches this
          // device anything or has anywhere else to go; every other failure
          // (bad key, camera, a Livepeer stream) just propagates.
          if (!directBits.url || !isPathDeadError(error)) throw error;
          if (relayFirst) {
            // The relay died first. Remember it — the next mint must not let
            // "a relay is deployed" outvote this device's own evidence again
            // — then give the direct path one shot: the relay was chosen on
            // a probe or an old marker, and both lie in both directions.
            markRelayFailed();
            if (cancelled) return;
            try {
              session = await openSession(false);
            } catch (directError) {
              if (isPathDeadError(directError)) markIngestUnreachable();
              throw directError;
            }
          } else {
            // The signaling POST died pointed straight at the ingest.
            // Remember it — a stuck creator retries in a loop, and the next
            // mint should know — then reach for the relay this device was
            // too optimistic to use the first time.
            markIngestUnreachable();
            if (cancelled) return;
            if (!canRelay) throw error;
            try {
              session = await openSession(true);
            } catch (relayError) {
              if (isPathDeadError(relayError)) markRelayFailed();
              throw relayError;
            }
          }
        }

        if (cancelled) {
          await session.stop();
          return;
        }
        sessionRef.current = session;

        // Without this a phone screen-locks mid-stream and the broadcast dies.
        await acquireWakeLock();
      } catch (error) {
        // A refused publish carries the responder's fingerprint — every field
        // observed 403 arrived with zero packets at our servers or the edge,
        // so the final URL, content type and body of whatever answered are
        // the only evidence of what is actually intercepting these requests.
        logger.error(
          'Failed to start broadcast',
          error instanceof WhipHttpError
            ? {
                streamKey: !!streamKey,
                whipStatus: error.status,
                whipRequestedUrl: error.requestedUrl,
                whipFinalUrl: error.finalUrl,
                whipContentType: error.contentType,
                whipBody: error.bodySnippet,
              }
            : { streamKey: !!streamKey },
          error,
        );
        if (cancelled) return;
        setPhase('error');
        setErrorMessage(describeMediaError(error));
      }
    })();

    return () => {
      cancelled = true;
      void teardown();
    };
    // facingMode deliberately excluded: switching cameras swaps the track in
    // place (see flipCamera) rather than restarting the whole ingest session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey, teardown, acquireWakeLock, acquireMic, probeCameras, watchForShareStop]);

  // Re-acquire the wake lock when the tab comes back to the foreground; the
  // browser drops it on visibility change and will not restore it itself.
  // 'reconnecting' counts as live here: backgrounding often bumps the
  // connection to 'disconnected', and no further visibilitychange fires once
  // it recovers — gating on 'live' alone would never re-acquire.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (wakeLockRef.current || (phase !== 'live' && phase !== 'reconnecting')) return;
      void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, acquireWakeLock]);

  // Closing the tab must end the stream, not strand it until Livepeer's
  // ingest timeout. pagehide fires on iOS where beforeunload does not.
  useEffect(() => {
    const onPageHide = () => {
      void sessionRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      micTrackRef.current?.stop();
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Elapsed timer, started once media is actually flowing.
  useEffect(() => {
    if (phase !== 'live' && phase !== 'reconnecting') return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  /**
   * Poster frame.
   *
   * A stream with no cover renders as an empty grey box everywhere it is
   * listed, and most streams have none — nothing in the go-live flow ever
   * required a picture. So the broadcast supplies its own: a frame off the
   * video actually being published, shortly after it connects and then every
   * few minutes, which also keeps the listing honest when the scene changes.
   *
   * Taken from the preview element rather than the track, so it captures
   * whatever the compositor is publishing (camera bubble over a screen share
   * included) — exactly what a viewer sees. Best-effort throughout: a failure
   * here is a stale poster, never a broken broadcast, so nothing is surfaced
   * to the creator.
   */
  useEffect(() => {
    if (phase !== 'live' || !streamId) return;
    let cancelled = false;

    const capture = async () => {
      const video = videoRef.current;
      if (cancelled || !video || !video.videoWidth) return;
      // A hidden tab stops feeding the element — the best a capture gets there
      // is the last painted frame, and the worst is a blank one.
      if (document.hidden) return;

      const width = Math.min(POSTER_WIDTH, video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.7)
      );
      if (cancelled || !blob) return;

      try {
        await updateStreamThumbnail(streamId, blob);
      } catch (error) {
        logger.info('Poster frame upload failed', error);
      }
    };

    const first = window.setTimeout(() => void capture(), POSTER_FIRST_DELAY_MS);
    const repeat = window.setInterval(() => void capture(), POSTER_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, [phase, streamId]);

  const toggleMic = () => {
    // Muting happens at the RAW capture, upstream of the effect graph — never
    // on the published track. The published track is the graph's output, which
    // also carries soundboard clips and, when a screen is shared, the system
    // audio; disabling it would take all of that off air with the voice.
    if (!rawMicStreamRef.current) return;
    const next = !micOn;
    setRawMicEnabled(next);
    setMicOn(next);
  };

  /**
   * Voice effects rebuild the graph on a fresh AudioContext rather than
   * re-patching the live one, because the pitch effects need the phase-vocoder
   * worklet loaded at build time — switching in place silently drops to the
   * warbly delay-line shifter. A rebuild yields a NEW output track, so the
   * published audio has to be rebuilt around it too.
   */
  const changeEffect = async (id: VoiceEffectId) => {
    if (switchingEffect || id === effect) return;
    setSwitchingEffect(true);
    const previous = effect;
    setEffect(id);
    try {
      const track = await rebuildEffect(id);
      if (!track) {
        setEffect(previous);
        return;
      }
      micTrackRef.current = track;
      // The rebuild reuses the same raw capture, which keeps its enabled flag,
      // so a muted host stays muted across a switch.
      await applySystemAudio(systemAudioRef.current);
    } catch (error) {
      logger.warn('Voice effect switch failed', error);
      setEffect(previous);
    } finally {
      setSwitchingEffect(false);
    }
  };

  /**
   * Soundboard clips ride the published track — see SoundboardPanel. Without a
   * graph (mic denied, or the fallback to the bare capture) injectSound is a
   * no-op, so this fails loudly instead of lighting a pad that plays nothing.
   */
  const playClip = useCallback(
    async (blob: Blob) => {
      if (!getProcessedStream()) throw new Error('No voice graph to mix into');
      await injectSound(blob);
    },
    [injectSound, getProcessedStream]
  );

  const toggleVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoOn(track.enabled);
  };

  const flipCamera = async () => {
    // Only meaningful with a live capture and session. Without these guards a
    // press during 'Starting camera…' — or racing End Stream while getUserMedia
    // is still prompting — orphaned the freshly acquired track: attached to
    // nothing, stopped by nothing, camera light on until full page unload.
    if (videoSwapRef.current) return;
    if (!streamRef.current || !sessionRef.current) return;
    videoSwapRef.current = true;
    const next = facingMode === 'user' ? 'environment' : 'user';
    let newTrack: MediaStreamTrack | null = null;
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        video: { ...cameraConstraints(), facingMode: next },
        audio: false,
      });
      newTrack = replacement.getVideoTracks()[0] ?? null;
      if (!newTrack) return;
      // Re-check: teardown may have run while getUserMedia was prompting.
      if (!streamRef.current || !sessionRef.current) return;

      if (!(await swapVideoTrack(newTrack))) return;
      setMirror(newTrack.getSettings?.().facingMode !== 'environment');
      setFacingMode(next);
      newTrack = null; // adopted into the stream — must not be stopped below
    } catch (error) {
      logger.warn('Camera flip failed', error);
    } finally {
      // Any bail-out or throw after acquisition lands here with the track
      // still set — stop it so the second camera doesn't stay captured.
      newTrack?.stop();
      videoSwapRef.current = false;
    }
  };

  const handleEnd = async () => {
    setIsEnding(true);
    await teardown();
    onEnd();
  };

  const isScreen = captureMode === 'screen';

  const statusLabel =
    phase === 'starting'
      ? isScreen
        ? 'Starting screen share…'
        : 'Starting camera…'
      : phase === 'connecting'
        ? 'Connecting…'
        : phase === 'reconnecting'
          ? 'Reconnecting…'
          : phase === 'live'
            ? 'LIVE'
            : 'Offline';

  /*
   * On a phone the broadcast IS the screen.
   *
   * The preview used to be a 16:9 card in a sheet with the controls stacked
   * under it, which on a phone meant a wide letterboxed strip of the creator
   * with two thirds of the display given over to chrome. Full-bleed instead:
   * the camera fills the device, in the device's own shape, and the controls
   * float over the picture. A screen share keeps `object-contain` even here —
   * cropping a desktop to a phone's aspect would cut the sides off the thing
   * being demonstrated.
   *
   * Desktop is untouched: there the card is the right answer, and a portrait
   * video filling a monitor is not.
   */
  const fullBleed = useIsMobile();

  return (
    <div className={cn(fullBleed ? 'absolute inset-0 bg-black' : 'space-y-4 pb-4')}>
      <div
        className={cn(
          'overflow-hidden bg-black',
          fullBleed ? 'absolute inset-0' : 'relative aspect-video w-full rounded-2xl'
        )}
      >
        {/* muted + playsInline: iOS Safari refuses to autoplay otherwise, and
            without playsInline it hijacks the video into fullscreen.
            object-contain for a screen share — cover crops a 16:10 desktop's
            edges off, which is where the taskbar and the chat window live. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            'h-full w-full',
            isScreen ? 'object-contain' : 'object-cover',
            mirror && 'scale-x-[-1]',
            !videoOn && 'opacity-0'
          )}
        />

        {!videoOn && phase !== 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
            <VideoOff className="h-8 w-8" />
            <span className="text-xs">{isScreen ? 'Screen paused' : 'Camera off'}</span>
          </div>
        )}

        {(phase === 'starting' || phase === 'connecting') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <Loader2 className="h-7 w-7 animate-spin text-white" />
            <span className="text-sm text-white">{statusLabel}</span>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
            <p className="text-sm text-white">{errorMessage}</p>
          </div>
        )}

        {(phase === 'live' || phase === 'reconnecting') && (
          <div className="absolute left-3 top-3 flex items-center gap-2">
            {/* data-live-pulse marks this as a meaningful live indicator (the
                themes map it to their live colour and exempt it from skeleton
                rules); data-keep-dark exempts it from the portal palette
                washes that would fade it to a translucent tint over the video
                — this chip renders inside the vaul drawer portal, outside
                #app-root, where the themes' restore rules can't reach. */}
            <span
              data-live-pulse
              data-keep-dark
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide',
                phase === 'live'
                  ? 'bg-red-500 text-white'
                  : 'bg-amber-500/90 text-black'
              )}
            >
              {/* data-live-pulse on the dot itself: the theme skeleton rules
                  match .animate-pulse per-element, so the chip's attribute
                  does not shield this span. */}
              <span
                data-live-pulse
                className={cn(
                  'h-1.5 w-1.5 rounded-full bg-current',
                  phase === 'live' && 'animate-pulse'
                )}
              />
              {statusLabel}
            </span>
            <span className="rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white">
              {formatElapsed(elapsed)}
            </span>
          </div>
        )}

        {isScreen && phase !== 'error' && (
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
            <ScreenShare className="h-3 w-3" />
            Sharing screen
          </span>
        )}
      </div>

      <div
        className={cn(
          'flex items-center justify-center gap-3',
          // Floating over the picture, nothing behind them. The row can outgrow
          // a narrow phone once screen share, bubble and flip are all showing,
          // so it scrolls sideways rather than wrapping into the video.
          fullBleed &&
            'absolute inset-x-0 bottom-0 z-10 overflow-x-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      >
        <ControlButton
          floating={fullBleed}
          active={micOn}
          onClick={toggleMic}
          disabled={phase === 'error' || !hasMic}
          label={
            !hasMic
              ? 'No microphone available'
              : micOn
                ? 'Mute microphone'
                : 'Unmute microphone'
          }
        >
          {micOn && hasMic ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </ControlButton>

        <ControlButton
          floating={fullBleed}
          active={videoOn}
          onClick={toggleVideo}
          disabled={phase === 'error'}
          label={
            videoOn
              ? isScreen
                ? 'Pause the screen share'
                : 'Turn camera off'
              : isScreen
                ? 'Resume the screen share'
                : 'Turn camera on'
          }
        >
          {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </ControlButton>

        {canShareScreen && (
          <ControlButton
            floating={fullBleed}
            active={!isScreen}
            onClick={isScreen ? stopScreenShare : startScreenShare}
            disabled={phase === 'error'}
            label={isScreen ? 'Stop sharing and go back to camera' : 'Share your screen'}
          >
            {isScreen ? (
              <ScreenShareOff className="h-5 w-5" />
            ) : (
              <ScreenShare className="h-5 w-5" />
            )}
          </ControlButton>
        )}

        {isScreen && (
          <ControlButton
            floating={fullBleed}
            // Same convention as the share button: the tinted state is the
            // one you click to switch off, not an error.
            active={!bubbleOn}
            onClick={toggleCameraBubble}
            disabled={phase === 'error'}
            label={bubbleOn ? 'Hide your camera bubble' : 'Show your camera in the corner'}
          >
            <PictureInPicture2 className="h-5 w-5" />
          </ControlButton>
        )}

        {isScreen && bubbleOn && (
          <ControlButton
            floating={fullBleed}
            active
            onClick={cycleBubbleCorner}
            disabled={phase === 'error'}
            label="Move the camera bubble to another corner"
          >
            <Move className="h-5 w-5" />
          </ControlButton>
        )}

        {hasMultipleCameras && !isScreen && (
          <ControlButton
            floating={fullBleed}
            active
            onClick={flipCamera}
            disabled={phase === 'error' || !videoOn}
            label="Switch camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </ControlButton>
        )}

        <ControlButton
          floating={fullBleed}
          active={openPanel !== 'voice'}
          onClick={() => setOpenPanel((p) => (p === 'voice' ? 'none' : 'voice'))}
          disabled={phase === 'error' || !hasMic}
          label={hasMic ? 'Voice effects' : 'Voice effects need a microphone'}
        >
          <Wand2 className="h-5 w-5" />
        </ControlButton>

        <ControlButton
          floating={fullBleed}
          active={openPanel !== 'sounds'}
          onClick={() => setOpenPanel((p) => (p === 'sounds' ? 'none' : 'sounds'))}
          disabled={phase === 'error' || !hasMic}
          label={hasMic ? 'Soundboard' : 'The soundboard needs a microphone'}
        >
          <Music className="h-5 w-5" />
        </ControlButton>

        {streamId && (
          <ControlButton
            floating={fullBleed}
            active={openPanel !== 'chat'}
            onClick={() => setOpenPanel((p) => (p === 'chat' ? 'none' : 'chat'))}
            disabled={phase === 'error'}
            label="Live chat"
          >
            <MessageSquare className="h-5 w-5" />
          </ControlButton>
        )}
      </div>

      {/* The room, at a glance. Only once media is flowing — before that every
          number is zero and reads as a failure rather than a fresh start. */}
      {streamId && (phase === 'live' || phase === 'reconnecting') && (
        <div
          className={cn(
            'flex items-center justify-center gap-4 text-[11px] text-zinc-400',
            // Under the live chip rather than under the video, and light on its
            // own — these are glanceable numbers, not a panel.
            fullBleed &&
              'absolute left-3 top-12 z-10 justify-start text-white/80 [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.9))]'
          )}
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {watching} watching
          </span>
          <span className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5" />
            {room?.likes ?? 0}
          </span>
          <span className="flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" />
            <DhbAmount amount={room?.totalTips ?? 0} iconClassName="h-3.5 w-3.5" />
          </span>
        </div>
      )}

      {/* What viewers are getting, when it stops being what the preview shows.
          Sits in the same place on both layouts, under the room numbers, so a
          host glancing at the corner sees it without hunting. */}
      {starved && (phase === 'live' || phase === 'reconnecting') && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200',
            fullBleed && 'absolute left-3 right-3 top-[4.75rem] z-10'
          )}
        >
          <SignalLow className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {health?.limitation === 'cpu'
              ? 'This device cannot encode the video fast enough — viewers are seeing a frozen picture. Closing other apps will help.'
              : 'Your upload has dropped — viewers are seeing a frozen picture even though your preview looks fine. Moving closer to the router or switching networks will help.'}
            {health ? ` (${health.fps} fps · ${health.videoKbps} kbps)` : ''}
          </span>
        </div>
      )}

      {openPanel === 'chat' && tokenId && (
        <div
          className={cn(
            'max-h-[45vh] overflow-hidden rounded-xl border border-white/10',
            // Above the floating controls, not below the video — there is no
            // "below the video" once the video is the whole screen.
            fullBleed && 'absolute inset-x-3 bottom-24 z-20 bg-black/80 backdrop-blur-xl'
          )}
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-white/60" />
              </div>
            }
          >
            {/* isHost: the same panel viewers see on the post page, plus the
                host's pin control. Keyed on the POST's tokenId, which is what
                the post page uses — this panel used to pass the stream's Mongo
                ObjectId, so host and audience named different rooms and only
                shared a conversation because the backend ignored the room and
                put everyone in the platform chat. */}
            <LivePostChat tokenId={tokenId} isHost />
          </Suspense>
        </div>
      )}

      {openPanel === 'voice' && (
        <div
          className={cn(
            'rounded-xl border border-white/10 bg-white/5 p-3',
            fullBleed && 'absolute inset-x-3 bottom-24 z-20 bg-black/80 backdrop-blur-xl',
            switchingEffect && 'pointer-events-none opacity-60'
          )}
        >
          <VoiceEffectSelector activeEffect={effect} onSelect={(id) => void changeEffect(id)} />
          <p className="mt-2 text-[11px] text-zinc-500">
            Viewers hear the effect; your own captions and transcripts still read
            the unprocessed microphone.
          </p>
        </div>
      )}

      {/* Kept mounted while hidden so the custom-sound list and the volume the
          host set survive closing the board mid-broadcast. */}
      <SoundboardPanel
        isVisible={openPanel === 'sounds'}
        onClose={() => setOpenPanel('none')}
        playClip={playClip}
        stopClip={stopInjectedSound}
        errorMessage="Could not play that — your microphone feed is not running"
      />

      {/* Full-bleed puts this top-right as a compact pill rather than a bar at
          the foot of the screen: the foot belongs to the controls, and two
          stacked bars over a portrait video eats the picture. It keeps a solid
          fill where the controls do not — ending a broadcast is the one action
          that should never be missed against a bright frame. */}
      <button
        onClick={handleEnd}
        disabled={isEnding}
        className={cn(
          'flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-60',
          fullBleed
            ? 'absolute right-3 top-3 z-20 h-9 rounded-full bg-red-500/90 px-4 text-xs text-white active:bg-red-500'
            : 'h-14 w-full gap-2 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300 hover:bg-red-500/20'
        )}
      >
        {isEnding ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Radio className="h-4 w-4" />
        )}
        {isEnding ? 'Ending…' : fullBleed ? 'End' : 'End Stream'}
      </button>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  disabled,
  label,
  floating,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  /**
   * Sitting on top of the video rather than under it. The pill and its border
   * are dropped — over a moving picture they read as clutter — and the icon
   * carries a shadow instead, which is what keeps it legible against a bright
   * frame now that nothing is behind it.
   */
  floating?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        floating
          ? cn(
              'h-12 w-12 [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.9))]',
              active ? 'text-white active:text-white/70' : 'text-red-400 active:text-red-300'
            )
          : cn(
              'h-12 w-12 border',
              active
                ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
            )
      )}
    >
      {children}
    </button>
  );
}
