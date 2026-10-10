/**
 * Floating PiP Mini-Player
 * =======================
 * Draggable floating video player for TV channels.
 * Supports mute/unmute and close. Renders as a fixed overlay.
 */

import { useRef, useEffect, useState, useCallback, useId } from 'react';
import { X, Volume2, VolumeX, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';
import type { PiPChannel } from '@/contexts/PiPContext';
import {
  claimMediaSession,
  releaseMediaSession,
  setMediaSessionPlaying,
} from '@/lib/media-session';

interface FloatingPiPPlayerProps {
  channel: PiPChannel;
  index: number;
  onClose: (id: string) => void;
}

const PLAYER_WIDTH = 280;
const PLAYER_HEIGHT = 158; // 16:9
const MARGIN = 12;
const CONTROLS_HEIGHT = 44;

export function FloatingPiPPlayer({ channel, index, onClose }: FloatingPiPPlayerProps) {
  const { t } = useTranslation();
  const instanceId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isMuted, setIsMuted] = useState(true); // Start muted for autoplay compatibility
  const workerRetried = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const width = Math.max(1, Math.min(expanded ? 420 : PLAYER_WIDTH, viewport.width - MARGIN * 2,
    (viewport.height - CONTROLS_HEIGHT - MARGIN * 2) * 16 / 9));
  const videoHeight = width * 9 / 16;
  const height = videoHeight + CONTROLS_HEIGHT;
  const [position, setPosition] = useState({ 
    x: window.innerWidth - PLAYER_WIDTH - MARGIN, 
    y: MARGIN + index * (PLAYER_HEIGHT + MARGIN + 8) 
  });
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragPointer = useRef<number | null>(null);

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const boundedPosition = {
    x: Math.max(0, Math.min(viewport.width - width, position.x)),
    y: Math.max(0, Math.min(viewport.height - height, position.y)),
  };

  // Muted-first play strategy: start muted, then try unmuting
  const playWithUnmuteAttempt = useCallback((video: HTMLVideoElement) => {
    video.muted = true;
    video.play().then(() => {
      // Playback started muted — now try unmuting
      video.muted = false;
      video.play().catch(() => {
        // Unmuted play blocked (e.g. SafePal WebView) — stay muted
        video.muted = true;
        setIsMuted(true);
      });
    }).catch(() => {
      // Even muted play failed — nothing we can do
    });
  }, []);

  // Init HLS with worker fallback
  const initHls = useCallback((video: HTMLVideoElement, streamUrl: string, useWorker: boolean) => {
    const hls = new Hls({
      enableWorker: useWorker,
      lowLatencyMode: true,
      maxBufferLength: 10,
      maxMaxBufferLength: 20,
    });
    hlsRef.current = hls;
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playWithUnmuteAttempt(video);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (useWorker && !workerRetried.current) {
          // Retry without Web Worker (restricted in some WebViews)
          workerRetried.current = true;
          hls.destroy();
          hlsRef.current = null;
          initHls(video, streamUrl, false);
        } else {
          onClose(channel.id);
        }
      }
    });
    return hls;
  }, [playWithUnmuteAttempt, onClose, channel.id]);

  // Init HLS stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    workerRetried.current = false;

    // Prefer native HLS wherever the browser provides it (Safari + every iOS
    // browser): its hardware media pipeline runs far cooler than hls.js's
    // software MSE decoder. iOS 17+ reports Hls.isSupported() (Managed Media
    // Source), so checking hls.js first wrongly ran the software path on modern
    // iPhones — a real overheating source. Native must be tried first.
    let nativeErrorHandler: (() => void) | null = null;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.streamUrl;
      playWithUnmuteAttempt(video);
      // Mirror the hls path's fatal-error behavior: a dead stream closes the
      // PiP instead of leaving a stuck black floating box.
      nativeErrorHandler = () => onClose(channel.id);
      video.addEventListener('error', nativeErrorHandler);
    } else if (Hls.isSupported()) {
      initHls(video, channel.streamUrl, true);
    }

    return () => {
      if (nativeErrorHandler) video.removeEventListener('error', nativeErrorHandler);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel.streamUrl, channel.id, initHls, playWithUnmuteAttempt, onClose]);

  // Keep muted state in sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  /**
   * Hold the OS media session while this window is audible.
   *
   * The PiP player starts muted so autoplay is allowed at all, and only
   * unmutes if the browser lets it — so `!isMuted` is the test, exactly as it
   * is on the feed cards. A muted mini-player claiming the lock screen would
   * mean the headphone pause button stops a silent corner of the page.
   *
   * There is no seek: a channel is live, so there is nowhere to scrub to.
   */
  useEffect(() => {
    if (isMuted) {
      releaseMediaSession(instanceId);
      return;
    }
    claimMediaSession(
      instanceId,
      { title: channel.name, artist: 'DeHub TV', artwork: channel.logo || null },
      {
        play: () => {
          videoRef.current?.play().catch(() => {});
        },
        pause: () => videoRef.current?.pause(),
        stop: () => onClose(channel.id),
      },
    );
    setMediaSessionPlaying(instanceId, true);
  }, [isMuted, instanceId, channel.name, channel.logo, channel.id, onClose]);

  // Closing the window, or the page navigating away, must not leave the OS
  // holding a session for a player that no longer exists.
  useEffect(() => () => releaseMediaSession(instanceId), [instanceId]);

  // Dragging
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (dragPointer.current !== null || e.button !== 0) return;
    e.preventDefault();
    dragPointer.current = e.pointerId;
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragPointer.current !== e.pointerId) return;
    const newX = Math.max(0, Math.min(window.innerWidth - width, e.clientX - dragOffset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - height, e.clientY - dragOffset.current.y));
    setPosition({ x: newX, y: newY });
  }, [width, height]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragPointer.current !== e.pointerId) return;
    dragPointer.current = null;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-[9999] rounded-xl overflow-hidden shadow-2xl border border-white/15',
        'bg-black/90 backdrop-blur-xl',
        isDragging ? 'cursor-grabbing' : 'cursor-default',
        'transition-shadow hover:shadow-[0_0_30px_rgba(0,0,0,0.8)]'
      )}
      style={{
        width,
        height,
        left: boundedPosition.x,
        top: boundedPosition.y,
      }}
    >
      {/* Drag handle */}
      <div
        className="absolute top-0 left-0 right-0 h-11 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 bg-gradient-to-b from-black/60 to-transparent"
        style={{ touchAction: 'none', userSelect: 'none' }}
        data-pip-drag-handle
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
      >
        <GripHorizontal className="w-4 h-4 text-white/40" />
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        muted={isMuted}
        playsInline
        {...{"webkit-playsinline": ""}}
        autoPlay
        className="w-full object-cover"
        style={{ height: videoHeight }}
      />

      {/* Bottom bar */}
      <div className="h-11 flex items-center justify-between pl-2 bg-black/80">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {channel.logo && (
            <img 
              src={channel.logo} 
              alt="" 
              className="w-5 h-5 rounded object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span className="text-white text-[11px] font-medium truncate">{channel.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t(isMuted ? 'calls.unmute' : 'calls.mute')}
            onClick={() => setIsMuted(!isMuted)}
            className="w-11 h-11 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-white" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-white" />
            )}
          </button>
          <button
            type="button"
            aria-label={t(expanded ? 'calls.minimize' : 'calls.expand')}
            onClick={() => { setPosition(boundedPosition); setExpanded(value => !value); }}
            className="w-11 h-11 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5 text-white" /> : <Maximize2 className="w-3.5 h-3.5 text-white" />}
          </button>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => onClose(channel.id)}
            className="w-11 h-11 rounded-lg hover:bg-red-500/60 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
