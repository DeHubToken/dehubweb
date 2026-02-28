/**
 * Radio Fullscreen Visualizer
 * ============================
 * Windows Media Player 2009-inspired fullscreen audio visualizer.
 * Features retro aesthetics with modern canvas-based visualization.
 * 
 * @module components/app/radio/RadioFullscreenVisualizer
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, Palette, Radio, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRadioPlayer } from '@/hooks';
import { Slider } from '@/components/ui/slider';
import {
  VisualizerStyle,
  drawBars,
  drawWaveform,
  drawCircular,
  drawMirror,
  drawRings,
  drawPulse,
  drawTerrain,
  resetRings,
  resetPulse,
  resetTerrain,
} from '@/components/app/audio/visualizer-styles';

interface RadioFullscreenVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  getAnalyser?: () => AnalyserNode | null;
}

const STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: 'bars', label: 'Bars' },
  { value: 'waveform', label: 'Wave' },
  { value: 'circular', label: 'Radial' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'rings', label: 'Rings' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'terrain', label: 'Terrain' },
];

export function RadioFullscreenVisualizer({ 
  isOpen, 
  onClose,
  getAnalyser 
}: RadioFullscreenVisualizerProps) {
  const { currentStation, isPlaying } = useRadioPlayer();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  
  const [style, setStyle] = useState<VisualizerStyle>('bars');
  const [styleIndex, setStyleIndex] = useState(0);
  const [hue, setHue] = useState(260);
  const [lavaMode, setLavaMode] = useState(false);
  const lavaHueRef = useRef(0);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  // Resize canvas separately from draw loop
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvasSizeRef.current.w !== w || canvasSizeRef.current.h !== h) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvasSizeRef.current = { w, h };
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [isOpen, resizeCanvas]);

  const nextStyle = useCallback(() => {
    const newIndex = (styleIndex + 1) % STYLES.length;
    setStyleIndex(newIndex);
    setStyle(STYLES[newIndex].value);
  }, [styleIndex]);

  const prevStyle = useCallback(() => {
    const newIndex = (styleIndex - 1 + STYLES.length) % STYLES.length;
    setStyleIndex(newIndex);
    setStyle(STYLES[newIndex].value);
  }, [styleIndex]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const analyser = typeof getAnalyser === 'function' ? getAnalyser() : null;
    if (!analyser) {
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w: cssW, h: cssH } = canvasSizeRef.current;
    
    // Ensure canvas is sized
    if (cssW === 0 || cssH === 0) {
      resizeCanvas();
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.frequencyBinCount);

    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeData);

    // In lava mode, cycle hue continuously
    const activeHue = lavaMode ? (lavaHueRef.current = (lavaHueRef.current + 0.5) % 360) : hue;

    switch (style) {
      case 'bars':
        drawBars(ctx, frequencyData, cssW, cssH, activeHue);
        break;
      case 'waveform':
        drawWaveform(ctx, timeData, cssW, cssH, activeHue);
        break;
      case 'circular':
        drawCircular(ctx, frequencyData, cssW, cssH, activeHue);
        break;
      case 'mirror':
        drawMirror(ctx, frequencyData, cssW, cssH, activeHue);
        break;
      case 'rings':
        drawRings(ctx, frequencyData, cssW, cssH, activeHue);
        break;
      case 'pulse':
        drawPulse(ctx, frequencyData, cssW, cssH, activeHue);
        break;
      case 'terrain':
        drawTerrain(ctx, frequencyData, cssW, cssH, activeHue);
        break;
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [style, hue, lavaMode, getAnalyser, resizeCanvas]);

  useEffect(() => {
    if (isOpen && isPlaying) {
      draw();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isOpen, isPlaying, draw]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    hideControlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseMove = () => resetControlsTimer();
    const handleKeyDown = (e: KeyboardEvent) => {
      resetControlsTimer();
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prevStyle();
      if (e.key === 'ArrowRight') nextStyle();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);

    resetControlsTimer();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [isOpen, onClose, resetControlsTimer, nextStyle, prevStyle]);

  useEffect(() => {
    resetRings();
    resetRings();
    resetPulse();
    resetTerrain();
  }, [style]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resetRings();
      resetRings();
      resetPulse();
      resetTerrain();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!currentStation) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] bg-black"
          onClick={resetControlsTimer}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />

          <div 
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px',
            }}
          />

          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.5) 100%)',
            }}
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showControls ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'absolute inset-0 pointer-events-none',
              showControls && 'pointer-events-auto'
            )}
          >
            <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0">
                    {currentStation.favicon ? (
                      <img 
                        src={currentStation.favicon} 
                        alt={currentStation.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Radio className="w-6 h-6 text-zinc-500" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-xs sm:text-sm text-zinc-400 uppercase tracking-wider mb-0.5">
                      Now Playing
                    </p>
                    <h2 className="text-lg sm:text-2xl font-bold text-white">
                      {currentStation.name}
                    </h2>
                    {currentStation.tags && (
                      <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
                        {currentStation.tags.split(',').slice(0, 3).join(' • ')}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
                >
                  <Minimize2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </button>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center gap-4 mb-4">
                <button
                  onClick={prevStyle}
                  className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
                
                <div className="min-w-[120px] text-center">
                  <p className="text-white font-semibold text-lg">{STYLES[styleIndex].label}</p>
                  <p className="text-zinc-500 text-xs">Visualization</p>
                </div>
                
                <button
                  onClick={nextStyle}
                  className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="flex items-center justify-center gap-3">
                {/* Lava mode toggle */}
                <button
                  onClick={() => setLavaMode(!lavaMode)}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center border transition-colors",
                    lavaMode
                      ? "bg-white/20 border-white/30 text-white"
                      : "bg-black/40 backdrop-blur-[24px] saturate-[180%] border-white/10 text-zinc-400 hover:text-white"
                  )}
                >
                  <Flame className="w-4 h-4" />
                </button>

                <Palette className="w-4 h-4 text-zinc-400" />
                <div 
                  className={cn(
                    "w-32 sm:w-48 h-3 rounded-full relative overflow-hidden transition-opacity",
                    lavaMode && "opacity-30 pointer-events-none"
                  )}
                  style={{
                    background: 'linear-gradient(to right, hsl(0, 80%, 60%), hsl(60, 80%, 60%), hsl(120, 80%, 60%), hsl(180, 80%, 60%), hsl(240, 80%, 60%), hsl(300, 80%, 60%), hsl(360, 80%, 60%))'
                  }}
                >
                  {/* Dark overlay for unselected (right) portion */}
                  <div 
                    className="absolute top-0 bottom-0 right-0 bg-black/70 pointer-events-none rounded-r-full"
                    style={{ left: `${(hue / 360) * 100}%` }}
                  />
                  <Slider
                    value={[hue]}
                    min={0}
                    max={360}
                    step={1}
                    onValueChange={(value) => { setLavaMode(false); setHue(value[0]); }}
                    className="absolute inset-0 w-full [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:-top-0.5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-lg [&_.relative]:bg-transparent [&_[data-orientation=horizontal]]:h-3 [&_[class*=Range]]:bg-transparent [&_[class*=Track]]:bg-transparent"
                  />
                </div>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}