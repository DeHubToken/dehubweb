import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Palette } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  VisualizerStyle,
  drawBars,
  drawWaveform,
  drawCircular,
  drawSpectrum,
  drawMirror,
  drawRings,
  drawPulse,
  drawTerrain,
  resetSpectrum,
  resetRings,
  resetPulse,
  resetTerrain,
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
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'rings', label: 'Rings' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'terrain', label: 'Terrain' },
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
  const [hue, setHue] = useState(0); // Default to left side (red)
  const [isInitialized, setIsInitialized] = useState(false);

  // Store onPlayPause in a ref to avoid dependency issues
  const onPlayPauseRef = useRef(onPlayPause);
  useEffect(() => {
    onPlayPauseRef.current = onPlayPause;
  }, [onPlayPause]);

  const setupAudio = useCallback(() => {
    if (isConnectedRef.current) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.crossOrigin = 'anonymous';
        
        // Attach ended listener immediately when creating audio
        audioRef.current.addEventListener('ended', () => {
          onPlayPauseRef.current();
        });
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
        drawBars(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
      case 'waveform':
        drawWaveform(ctx, timeData, canvas.width, canvas.height, hue);
        break;
      case 'circular':
        drawCircular(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
      case 'spectrum':
        drawSpectrum(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
      case 'mirror':
        drawMirror(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
      case 'rings':
        drawRings(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
      case 'pulse':
        drawPulse(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
      case 'terrain':
        drawTerrain(ctx, frequencyData, canvas.width, canvas.height, hue);
        break;
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [style, hue]);

  useEffect(() => {
    if (isPlaying && !isInitialized) {
      setupAudio();
    }
  }, [isPlaying, isInitialized, setupAudio]);

  // Separate effect for playback control - no dependency on draw
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Separate effect for animation
  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      draw();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [isPlaying, draw]);

  useEffect(() => {
    // Reset visualizer state when switching styles
    resetSpectrum();
    resetRings();
    resetPulse();
    resetTerrain();
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
      resetSpectrum();
      resetRings();
      resetPulse();
      resetTerrain();
    };
  }, []);

  // ended listener is now attached in setupAudio

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={320}
        height={160}
        className="w-full h-full rounded-xl bg-black/40"
        onClick={onPlayPause}
      />

      {/* Controls overlay */}
      {showStylePicker && (
        <div className="absolute bottom-2 left-2 right-2 flex items-end gap-2">
          {/* Color slider */}
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1.5 border border-white/10 shrink-0">
            <Palette className="w-3.5 h-3.5 text-white/60" />
            <div 
              className="w-16 h-2 rounded-full relative overflow-hidden"
              style={{
                background: 'linear-gradient(to right, hsl(0, 80%, 60%), hsl(60, 80%, 60%), hsl(120, 80%, 60%), hsl(180, 80%, 60%), hsl(240, 80%, 60%), hsl(300, 80%, 60%), hsl(360, 80%, 60%))'
              }}
            >
              <Slider
                value={[hue]}
                min={0}
                max={360}
                step={1}
                onValueChange={(value) => setHue(value[0])}
                className="absolute inset-0 w-full [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:-top-0.5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_.relative]:bg-transparent [&_[data-orientation=horizontal]]:h-2 [&_[class*=Range]]:bg-transparent [&_[class*=Track]]:bg-transparent"
              />
            </div>
          </div>

          {/* Style picker - scrollable */}
          <div className="flex-1 overflow-x-auto scrollbar-none">
            <div className="flex gap-1 w-max">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    setStyle(s.value);
                  }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-full transition-all whitespace-nowrap
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
          </div>
        </div>
      )}

      {/* Play/Pause button overlay - always visible in center */}
      <div 
        className="absolute inset-0 flex items-center justify-center cursor-pointer pointer-events-none"
        style={{ pointerEvents: 'none' }}
      >
        <div 
          className={`w-12 h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 transition-all pointer-events-auto ${
            isPlaying ? 'opacity-0 hover:opacity-100' : ''
          }`}
          onClick={onPlayPause}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-white fill-white" />
          ) : (
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          )}
        </div>
      </div>
    </div>
  );
}
