import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  drawStatic,
  decodeAudioWaveform,
  resetSpectrum,
  resetRings,
  resetPulse,
  resetTerrain,
  resetStatic,
} from './visualizer-styles';

interface AudioVisualizerProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  className?: string;
  showStylePicker?: boolean;
  /** When true the audio output is muted (visualizer still animates). */
  muted?: boolean;
  /** Seed for the static waveform style (e.g. post id). */
  seed?: string;
}

const STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: 'static', label: 'Default' },
  { value: 'bars', label: 'Bars' },
  { value: 'waveform', label: 'Wave' },
  { value: 'circular', label: 'Radial' },
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'rings', label: 'Rings' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'terrain', label: 'Terrain' },
];

const STATIC_BAR_COUNT = 100;

export function AudioVisualizer({
  audioUrl,
  isPlaying,
  onPlayPause,
  className = '',
  showStylePicker = true,
  muted = false,
  seed = 'default',
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isConnectedRef = useRef(false);
  
  const [style, setStyle] = useState<VisualizerStyle>('static');
  const [hue, setHue] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);

  // Store onPlayPause in a ref to avoid dependency issues
  const onPlayPauseRef = useRef(onPlayPause);
  useEffect(() => {
    onPlayPauseRef.current = onPlayPause;
  }, [onPlayPause]);

  // Decode the audio file to get full-track waveform peaks on mount
  useEffect(() => {
    decodeAudioWaveform(audioUrl, STATIC_BAR_COUNT, (peaks) => {
      setWaveformPeaks(peaks);
    });
  }, [audioUrl]);

  // Draw the idle waveform once peaks are available (before any playback)
  const peaksRef = useRef<number[] | null>(null);
  peaksRef.current = waveformPeaks;

  useEffect(() => {
    if (!waveformPeaks || !canvasRef.current || style !== 'static') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Draw idle state at progress 0
    drawStatic(ctx, new Uint8Array(0), canvas.width, canvas.height, hue, seed, 0, waveformPeaks);
  }, [waveformPeaks, style, hue, seed]);

  // Store muted prop in ref for use during setup
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const setupAudio = useCallback(() => {
    if (isConnectedRef.current) return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.crossOrigin = 'anonymous';
        // Set initial muted state from prop
        audioRef.current.muted = mutedRef.current;
        
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
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (style === 'static') {
      // For static style, we just need progress — no analyser needed
      const audio = audioRef.current;
      const progress = audio && audio.duration ? audio.currentTime / audio.duration : 0;
      drawStatic(ctx, new Uint8Array(0), canvas.width, canvas.height, hue, seed, progress, peaksRef.current);
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

    // All other styles need the analyser
    if (!analyserRef.current) return;

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
  }, [style, hue, seed]);

  useEffect(() => {
    if (isPlaying && !isInitialized) {
      setupAudio();
    }
  }, [isPlaying, isInitialized, setupAudio]);

  // Separate effect for playback control
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Sync muted state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  // Animation loop
  useEffect(() => {
    if (isPlaying) {
      // For static style, we can animate even without analyser (just progress)
      if (style === 'static' || analyserRef.current) {
        draw();
      }
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [isPlaying, draw]);

  useEffect(() => {
    resetSpectrum();
    resetRings();
    resetPulse();
    resetTerrain();
    resetStatic();
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
      isConnectedRef.current = false;
      resetSpectrum();
      resetRings();
      resetPulse();
      resetTerrain();
      resetStatic();
    };
  }, []);

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
        <div data-no-swipe className="absolute bottom-2 left-2 right-2 flex items-end gap-2 pointer-events-auto z-20" style={{ touchAction: 'pan-x' }}>
          {/* Color slider */}
          <div
            className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1.5 border border-white/10 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
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
                    e.preventDefault();
                    setStyle(s.value);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="relative px-2.5 py-1 text-[10px] font-medium rounded-lg whitespace-nowrap transition-colors text-white/60 hover:text-white/80"
                >
                  {style === s.value && (
                    <motion.div
                      layoutId="audio-style-indicator"
                      className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/25 via-white/15 to-white/8 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className={`relative z-10 ${style === s.value ? 'text-white' : ''}`}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Play/Pause button overlay */}
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