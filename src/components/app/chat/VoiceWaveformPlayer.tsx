/**
 * VoiceWaveformPlayer
 * ====================
 * Premium synthwave-style waveform audio player for voice messages.
 * Decodes audio, extracts amplitude peaks, renders an interactive canvas
 * with smooth bars that reflect actual recording volume spikes.
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceWaveformPlayerProps {
  src: string;
  className?: string;
}

const BAR_COUNT = 40;
const BAR_WIDTH = 2.5;
const BAR_GAP = 1.5;
const MIN_BAR_HEIGHT = 2;
const CANVAS_HEIGHT = 32;

function extractPeaks(audioBuffer: AudioBuffer, count: number): number[] {
  const channel = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(channel.length / count);
  const peaks: number[] = [];

  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channel.length);
    for (let j = start; j < end; j++) {
      sum += Math.abs(channel[j]);
    }
    peaks.push(sum / (end - start));
  }

  // Normalize
  const max = Math.max(...peaks, 0.001);
  return peaks.map(p => p / max);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  progress: number,
  width: number,
  height: number,
  dpr: number,
) {
  ctx.clearRect(0, 0, width * dpr, height * dpr);

  const totalBarWidth = BAR_WIDTH + BAR_GAP;
  const startX = (width * dpr - peaks.length * totalBarWidth * dpr) / 2;

  for (let i = 0; i < peaks.length; i++) {
    const barHeight = Math.max(MIN_BAR_HEIGHT * dpr, peaks[i] * (height - 4) * dpr);
    const x = startX + i * totalBarWidth * dpr;
    const y = (height * dpr - barHeight) / 2;
    const barProgress = i / peaks.length;

    if (barProgress <= progress) {
      // Played — bright white
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    } else {
      // Unplayed — dim white
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    }

    // Draw rounded bar
    const radius = Math.min(BAR_WIDTH * dpr * 0.5, barHeight * 0.5);
    ctx.beginPath();
    ctx.roundRect(x, y, BAR_WIDTH * dpr, barHeight, radius);
    ctx.fill();
  }
}

export const VoiceWaveformPlayer = memo(function VoiceWaveformPlayer({ src, className }: VoiceWaveformPlayerProps) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // Decode audio and extract peaks
  useEffect(() => {
    let cancelled = false;
    const audioCtx = new AudioContext();

    fetch(src)
      .then(res => res.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => {
        if (cancelled) return;
        setPeaks(extractPeaks(decoded, BAR_COUNT));
        setDuration(decoded.duration);
        setIsLoaded(true);
      })
      .catch(err => {
        console.warn('[VoiceWaveform] Decode failed, using fallback bars', err);
        // Generate random-ish fallback bars
        setPeaks(Array.from({ length: BAR_COUNT }, (_, i) =>
          0.2 + 0.6 * Math.abs(Math.sin(i * 0.7 + i * i * 0.01))
        ));
        setIsLoaded(true);
      })
      .finally(() => audioCtx.close());

    return () => { cancelled = true; };
  }, [src]);

  // Setup audio element
  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    });
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [src]);

  // Animation loop for progress
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const progress = duration > 0 ? currentTime / duration : 0;
    drawWaveform(ctx, peaks, progress, rect.width, CANVAS_HEIGHT, dpr);
  }, [peaks, currentTime, duration]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    audioRef.current.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const timeDisplay = isPlaying || currentTime > 0
    ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
    : formatDuration(duration);

  return (
    <div className={`flex items-center gap-2.5 rounded-xl bg-white/[0.06] backdrop-blur-sm px-3 py-2 max-w-[260px] ${className || ''}`}>
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={!isLoaded}
        className="w-8 h-8 rounded-md bg-white/[0.12] hover:bg-white/[0.2] flex items-center justify-center transition-colors shrink-0 disabled:opacity-30"
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 text-white" />
        ) : (
          <Play className="w-3.5 h-3.5 text-white ml-0.5" />
        )}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full cursor-pointer"
          style={{ height: `${CANVAS_HEIGHT}px` }}
        />
        <span className="text-[9px] text-white/40 tabular-nums leading-none">{timeDisplay}</span>
      </div>
    </div>
  );
});
