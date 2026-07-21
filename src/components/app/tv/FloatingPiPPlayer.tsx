/**
 * Floating PiP Mini-Player
 * =======================
 * Draggable floating video player for TV channels.
 * Supports mute/unmute and close. Renders as a fixed overlay.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Volume2, VolumeX, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';
import type { PiPChannel } from '@/contexts/PiPContext';

interface FloatingPiPPlayerProps {
  channel: PiPChannel;
  index: number;
  onClose: (id: string) => void;
}

const PLAYER_WIDTH = 280;
const PLAYER_HEIGHT = 158; // 16:9
const MARGIN = 12;

export function FloatingPiPPlayer({ channel, index, onClose }: FloatingPiPPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isMuted, setIsMuted] = useState(true); // Start muted for autoplay compatibility
  const workerRetried = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ 
    x: window.innerWidth - PLAYER_WIDTH - MARGIN, 
    y: MARGIN + index * (PLAYER_HEIGHT + MARGIN + 8) 
  });
  const dragOffset = useRef({ x: 0, y: 0 });

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

  // Dragging
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - PLAYER_WIDTH, e.clientX - dragOffset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - PLAYER_HEIGHT, e.clientY - dragOffset.current.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
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
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT + 36, // extra for controls bar
        left: position.x,
        top: position.y,
      }}
    >
      {/* Drag handle */}
      <div
        className="absolute top-0 left-0 right-0 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 bg-gradient-to-b from-black/60 to-transparent"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
        style={{ height: PLAYER_HEIGHT }}
      />

      {/* Bottom bar */}
      <div className="h-9 flex items-center justify-between px-2 bg-black/80">
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
            onClick={() => setIsMuted(!isMuted)}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-white" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-white" />
            )}
          </button>
          <button
            onClick={() => onClose(channel.id)}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-500/60 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
