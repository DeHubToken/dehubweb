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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { publishToWhip, type WhipSession, type WhipState } from '@/lib/livepeer/whip';
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
import { getLiveStream } from '@/lib/api/dehub/livestream';
import { useQuery } from '@tanstack/react-query';
import { createLogger } from '@/lib/logger';

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

interface GoLiveBroadcasterProps {
  streamKey: string;
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
  /** Fired when the creator ends the broadcast; the parent runs API teardown. */
  onEnd: () => void;
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

/** Turns the DOM's terse permission errors into something a creator can act on. */
function describeMediaError(error: unknown): string {
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
  initialScreenStream = null,
  streamId,
  onEnd,
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

  /** Feature detection, not a device check: undefined on iOS and on Android. */
  const canShareScreen = typeof navigator?.mediaDevices?.getDisplayMedia === 'function';

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
    | { totalViews?: number; peakViewers?: number; likes?: number; totalTips?: number }
    | undefined;

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
              video: { ...VIDEO_CONSTRAINTS, facingMode: facingModeRef.current },
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
          video: { ...VIDEO_CONSTRAINTS, facingMode: facingModeRef.current },
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
            video: { ...VIDEO_CONSTRAINTS, facingMode },
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

        const session = await publishToWhip({
          streamKey,
          stream,
          onStateChange: (state: WhipState, detail) => {
            if (cancelled) return;
            if (state === 'live') setPhase('live');
            else if (state === 'reconnecting') setPhase('reconnecting');
            else if (state === 'failed') {
              setPhase('error');
              setErrorMessage(detail || 'The broadcast connection failed.');
              // Unrecoverable: nothing here retries a 'failed' connection, so
              // holding the camera, mic, and wake lock on a dead error screen
              // is pure leak (hardware light on, phone kept awake). Stop the
              // local capture; the End button still runs the backend teardown.
              void teardown();
            }
          },
        });

        if (cancelled) {
          await session.stop();
          return;
        }
        sessionRef.current = session;

        // Without this a phone screen-locks mid-stream and the broadcast dies.
        await acquireWakeLock();
      } catch (error) {
        logger.error('Failed to start broadcast', { streamKey: !!streamKey }, error);
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
        video: { ...VIDEO_CONSTRAINTS, facingMode: next },
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

  return (
    <div className="space-y-4 pb-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
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

      <div className="flex items-center justify-center gap-3">
        <ControlButton
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
            active
            onClick={flipCamera}
            disabled={phase === 'error' || !videoOn}
            label="Switch camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </ControlButton>
        )}

        <ControlButton
          active={openPanel !== 'voice'}
          onClick={() => setOpenPanel((p) => (p === 'voice' ? 'none' : 'voice'))}
          disabled={phase === 'error' || !hasMic}
          label={hasMic ? 'Voice effects' : 'Voice effects need a microphone'}
        >
          <Wand2 className="h-5 w-5" />
        </ControlButton>

        <ControlButton
          active={openPanel !== 'sounds'}
          onClick={() => setOpenPanel((p) => (p === 'sounds' ? 'none' : 'sounds'))}
          disabled={phase === 'error' || !hasMic}
          label={hasMic ? 'Soundboard' : 'The soundboard needs a microphone'}
        >
          <Music className="h-5 w-5" />
        </ControlButton>

        {streamId && (
          <ControlButton
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
        <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {room?.peakViewers ?? room?.totalViews ?? 0} watching
          </span>
          <span className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5" />
            {room?.likes ?? 0}
          </span>
          <span className="flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" />
            {room?.totalTips ?? 0} DHB
          </span>
        </div>
      )}

      {openPanel === 'chat' && streamId && (
        <div className="max-h-[45vh] overflow-hidden rounded-xl border border-white/10">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-white/60" />
              </div>
            }
          >
            {/* isHost: the same panel viewers see on the post page, plus the
                host's pin control. One global livechat room backs both, so
                what shows here is exactly what the audience is reading. */}
            <LivePostChat streamId={streamId} isHost />
          </Suspense>
        </div>
      )}

      {openPanel === 'voice' && (
        <div
          className={cn(
            'rounded-xl border border-white/10 bg-white/5 p-3',
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

      <button
        onClick={handleEnd}
        disabled={isEnding}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-60"
      >
        {isEnding ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Radio className="h-4 w-4" />
        )}
        {isEnding ? 'Ending…' : 'End Stream'}
      </button>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  disabled,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
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
        'flex h-12 w-12 items-center justify-center rounded-full border transition-colors disabled:opacity-40',
        active
          ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
          : 'border-red-500/40 bg-red-500/20 text-red-300 hover:bg-red-500/30'
      )}
    >
      {children}
    </button>
  );
}
