/**
 * Go Live Broadcaster
 * ===================
 * The camera surface for browser-native livestreaming: grabs the webcam,
 * publishes it to Livepeer over WHIP, and gives the creator the controls they
 * need while live. This is what removes the OBS requirement — the RTMP
 * credentials path still exists beside it for anyone running a real encoder.
 *
 * Loaded dynamically by GoLiveModal so the WebRTC code only reaches people who
 * actually pick the camera option.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  Loader2,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { publishToWhip, type WhipSession, type WhipState } from '@/lib/livepeer/whip';
import { createLogger } from '@/lib/logger';

const logger = createLogger('GoLiveBroadcaster');

interface GoLiveBroadcasterProps {
  streamKey: string;
  /** Fired when the creator ends the broadcast; the parent runs API teardown. */
  onEnd: () => void;
}

type Phase = 'camera' | 'connecting' | 'live' | 'reconnecting' | 'error';

/** 720p is the sweet spot: 1080p routinely exceeds a phone's upstream. */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
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

export function GoLiveBroadcaster({ streamKey, onEnd }: GoLiveBroadcasterProps) {
  const [phase, setPhase] = useState<Phase>('camera');
  const [errorMessage, setErrorMessage] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  // Preview mirroring keyed to what the TRACK reports, not what was requested:
  // facingMode is an ideal constraint, so "environment" can be satisfied by a
  // second front camera (two-webcam desktops) — which would un-mirror a
  // still-front-facing self-view if the requested value drove the transform.
  const [mirror, setMirror] = useState(true);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isEnding, setIsEnding] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<WhipSession | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const flipInFlightRef = useRef(false);

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

  const teardown = useCallback(async () => {
    releaseWakeLock();
    await sessionRef.current?.stop();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [releaseWakeLock]);

  // Start the camera, then open the ingest session. Every await below
  // re-checks `cancelled`, so an unmount mid-negotiation cleans up whatever
  // had been acquired by that point instead of stranding a live session.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...VIDEO_CONSTRAINTS, facingMode },
          audio: AUDIO_CONSTRAINTS,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setMirror(stream.getVideoTracks()[0]?.getSettings?.().facingMode !== 'environment');
        // Permission was just granted, so enumerateDevices now returns the
        // real device list — re-probe for the flip button.
        probeCameras();
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
  }, [streamKey, teardown, acquireWakeLock, probeCameras]);

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
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCamera = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  };

  const flipCamera = async () => {
    // Only meaningful with a live capture and session. Without these guards a
    // press during 'Starting camera…' — or racing End Stream while getUserMedia
    // is still prompting — orphaned the freshly acquired track: attached to
    // nothing, stopped by nothing, camera light on until full page unload.
    if (flipInFlightRef.current) return;
    if (!streamRef.current || !sessionRef.current) return;
    flipInFlightRef.current = true;
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

      // Swap into the live session first so viewers never see a gap, then
      // retire the old track and splice the new one into the preview stream.
      await sessionRef.current.replaceTrack('video', newTrack);

      const oldTrack = streamRef.current.getVideoTracks()[0];
      if (oldTrack) {
        streamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }
      streamRef.current.addTrack(newTrack);
      newTrack.enabled = cameraOn;
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      setMirror(newTrack.getSettings?.().facingMode !== 'environment');
      setFacingMode(next);
      newTrack = null; // adopted into the stream — must not be stopped below
    } catch (error) {
      logger.warn('Camera flip failed', error);
    } finally {
      // Any bail-out or throw after acquisition lands here with the track
      // still set — stop it so the second camera doesn't stay captured.
      newTrack?.stop();
      flipInFlightRef.current = false;
    }
  };

  const handleEnd = async () => {
    setIsEnding(true);
    await teardown();
    onEnd();
  };

  const statusLabel =
    phase === 'camera'
      ? 'Starting camera…'
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
            without playsInline it hijacks the video into fullscreen. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            'h-full w-full object-cover',
            mirror && 'scale-x-[-1]',
            !cameraOn && 'opacity-0'
          )}
        />

        {!cameraOn && phase !== 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
            <VideoOff className="h-8 w-8" />
            <span className="text-xs">Camera off</span>
          </div>
        )}

        {(phase === 'camera' || phase === 'connecting') && (
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
      </div>

      <div className="flex items-center justify-center gap-3">
        <ControlButton
          active={micOn}
          onClick={toggleMic}
          disabled={phase === 'error'}
          label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </ControlButton>

        <ControlButton
          active={cameraOn}
          onClick={toggleCamera}
          disabled={phase === 'error'}
          label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </ControlButton>

        {hasMultipleCameras && (
          <ControlButton
            active
            onClick={flipCamera}
            disabled={phase === 'error' || !cameraOn}
            label="Switch camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </ControlButton>
        )}
      </div>

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
