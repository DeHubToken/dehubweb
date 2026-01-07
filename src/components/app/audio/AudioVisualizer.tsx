import { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import {
  VisualizerStyle,
  drawBars,
  drawWaveform,
  drawCircular,
  drawParticles,
  resetParticles,
} from './visualizer-styles';

interface AudioVisualizerProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  className?: string;
  showStylePicker?: boolean;
}

const STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: 'bars', label: 'Bars' },
  { value: 'waveform', label: 'Wave' },
  { value: 'circular', label: 'Radial' },
  { value: 'particles', label: 'Burst' },
];

export function AudioVisualizer({
  audioUrl,
  isPlaying,
  onPlayPause,
  className = '',
  showStylePicker = true,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isConnectedRef = useRef(false);
  
  const [style, setStyle] = useState<VisualizerStyle>('bars');
  const [isInitialized, setIsInitialized] = useState(false);

  const setupAudio = useCallback(() => {
    if (isConnectedRef.current) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.crossOrigin = 'anonymous';
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      sourceRef.current = ctx.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);

      isConnectedRef.current = true;
      setIsInitialized(true);
    } catch (err) {
      console.error('Failed to setup audio:', err);
    }
  }, [audioUrl]);

  const draw = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount);
    const timeData = new Uint8Array(analyserRef.current.frequencyBinCount);

    analyserRef.current.getByteFrequencyData(frequencyData);
    analyserRef.current.getByteTimeDomainData(timeData);

    switch (style) {
      case 'bars':
        drawBars(ctx, frequencyData, canvas.width, canvas.height);
        break;
      case 'waveform':
        drawWaveform(ctx, timeData, canvas.width, canvas.height);
        break;
      case 'circular':
        drawCircular(ctx, frequencyData, canvas.width, canvas.height);
        break;
      case 'particles':
        drawParticles(ctx, frequencyData, canvas.width, canvas.height);
        break;
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [style]);

  useEffect(() => {
    if (isPlaying && !isInitialized) {
      setupAudio();
    }
  }, [isPlaying, isInitialized, setupAudio]);

  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(console.error);
      draw();
    } else {
      audioRef.current.pause();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, [isPlaying, draw]);

  useEffect(() => {
    if (style !== 'particles') {
      resetParticles();
    }
  }, [style]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Don't close AudioContext as it may be reused
      isConnectedRef.current = false;
      resetParticles();
    };
  }, []);

  // Handle audio end
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      onPlayPause();
    };

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [onPlayPause, isInitialized]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        className="w-full h-full rounded-xl bg-black/40"
        onClick={onPlayPause}
      />

      {/* Style picker */}
      {showStylePicker && (
        <div className="absolute bottom-2 right-2 flex gap-1">
          {STYLES.map((s) => (
            <button
              key={s.value}
              onClick={(e) => {
                e.stopPropagation();
                setStyle(s.value);
              }}
              className={`px-2 py-1 text-[10px] font-medium rounded-full transition-all
                ${
                  style === s.value
                    ? 'bg-white/30 text-white border border-white/40'
                    : 'bg-black/40 text-white/60 hover:bg-black/60 hover:text-white/80 border border-white/10'
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Play indicator overlay when not playing */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
}
