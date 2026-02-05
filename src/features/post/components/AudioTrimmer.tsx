import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, Pause, Scissors, Check, Music } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { generateWaveformFromBlob, sliceAudioBlob, formatTime } from '@/lib/audio-waveform';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AudioTrimmerProps {
  isOpen: boolean;
  onClose: () => void;
  audioUrl: string;
  audioBlob: Blob;
  duration: number;
  maxDuration: number;
  fileName?: string;
  onApply: (trimmedBlob: Blob, trimStart: number, trimEnd: number) => void;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;
type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

const ARROW_STEP = 0.5; // seconds to adjust per arrow key press
const SHIFT_ARROW_STEP = 2; // seconds when holding shift

export function AudioTrimmer({
  isOpen,
  onClose,
  audioUrl,
  audioBlob,
  duration,
  maxDuration,
  fileName,
  onApply,
}: AudioTrimmerProps) {
  const [waveform, setWaveform] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(Math.min(duration, maxDuration));
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'window' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartTrim = useRef({ start: 0, end: 0 });

  // Load waveform on mount
  useEffect(() => {
    if (!isOpen) return;
    
    setIsLoading(true);
    generateWaveformFromBlob(audioBlob, 150)
      .then(data => {
        setWaveform(data.peaks);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to generate waveform:', err);
        // Create fake waveform
        setWaveform(Array(150).fill(0).map(() => Math.random() * 0.5 + 0.2));
        setIsLoading(false);
      });
  }, [audioBlob, isOpen]);

  // Create audio element
  useEffect(() => {
    if (!isOpen) return;
    
    audioRef.current = new Audio(audioUrl);
    audioRef.current.playbackRate = playbackSpeed;
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    audioRef.current.addEventListener('ended', handleAudioEnded);
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('ended', handleAudioEnded);
        audioRef.current = null;
      }
    };
  }, [audioUrl, isOpen]);

  // Update playback speed when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const step = e.shiftKey ? SHIFT_ARROW_STEP : ARROW_STEP;
      const windowDuration = trimEnd - trimStart;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.altKey) {
            // Alt+Left: Move start handle left
            const newStart = Math.max(0, trimStart - step);
            setTrimStart(newStart);
            if (trimEnd - newStart > maxDuration) {
              setTrimEnd(newStart + maxDuration);
            }
          } else if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+Left: Move end handle left
            const newEnd = Math.max(trimStart + 1, trimEnd - step);
            setTrimEnd(newEnd);
          } else {
            // Left: Move entire window left
            const newStart = Math.max(0, trimStart - step);
            const shift = trimStart - newStart;
            setTrimStart(newStart);
            setTrimEnd(trimEnd - shift);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.altKey) {
            // Alt+Right: Move start handle right
            const newStart = Math.min(trimEnd - 1, trimStart + step);
            setTrimStart(newStart);
          } else if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+Right: Move end handle right
            const newEnd = Math.min(duration, trimEnd + step);
            setTrimEnd(newEnd);
            if (newEnd - trimStart > maxDuration) {
              setTrimStart(newEnd - maxDuration);
            }
          } else {
            // Right: Move entire window right
            const newEnd = Math.min(duration, trimEnd + step);
            const shift = newEnd - trimEnd;
            setTrimEnd(newEnd);
            setTrimStart(trimStart + shift);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, trimStart, trimEnd, duration, maxDuration]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    setCurrentTime(time);
    
    // Stop at trim end
    if (time >= trimEnd) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Start from trim start if outside selection
      if (audioRef.current.currentTime < trimStart || audioRef.current.currentTime >= trimEnd) {
        audioRef.current.currentTime = trimStart;
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, trimStart, trimEnd]);

  const getPositionFromTime = (time: number): number => {
    return (time / duration) * 100;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, type: 'start' | 'end' | 'window') => {
    e.preventDefault();
    setIsDragging(type);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartX.current = clientX;
    dragStartTrim.current = { start: trimStart, end: trimEnd };
  }, [trimStart, trimEnd]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !waveformRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const rect = waveformRef.current.getBoundingClientRect();
    const deltaX = clientX - dragStartX.current;
    const deltaTime = (deltaX / rect.width) * duration;
    
    if (isDragging === 'start') {
      const newStart = Math.max(0, Math.min(trimEnd - 1, dragStartTrim.current.start + deltaTime));
      setTrimStart(newStart);
      // Adjust end if window is too long
      if (trimEnd - newStart > maxDuration) {
        setTrimEnd(newStart + maxDuration);
      }
    } else if (isDragging === 'end') {
      const newEnd = Math.max(trimStart + 1, Math.min(duration, dragStartTrim.current.end + deltaTime));
      setTrimEnd(newEnd);
      // Adjust start if window is too long
      if (newEnd - trimStart > maxDuration) {
        setTrimStart(newEnd - maxDuration);
      }
    } else if (isDragging === 'window') {
      const windowDuration = dragStartTrim.current.end - dragStartTrim.current.start;
      let newStart = dragStartTrim.current.start + deltaTime;
      let newEnd = dragStartTrim.current.end + deltaTime;
      
      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = windowDuration;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - windowDuration;
      }
      
      setTrimStart(newStart);
      setTrimEnd(newEnd);
    }
  }, [isDragging, duration, trimStart, trimEnd, maxDuration]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const trimmedBlob = await sliceAudioBlob(audioBlob, trimStart, trimEnd);
      onApply(trimmedBlob, trimStart, trimEnd);
    } catch (err) {
      console.error('Failed to trim audio:', err);
      toast.error('Failed to trim audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectionDuration = trimEnd - trimStart;

  // Truncate file name for display
  const displayFileName = fileName 
    ? fileName.length > 30 
      ? fileName.slice(0, 27) + '...' 
      : fileName
    : null;

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent hideHandle className="bg-zinc-950 border-zinc-800 max-h-[90vh] overflow-hidden flex flex-col">
        <DrawerTitle className="sr-only">Trim Audio</DrawerTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
          <span className="text-white font-semibold">Trim Audio</span>
          <button
            onClick={handleApply}
            disabled={isLoading || isProcessing || selectionDuration > maxDuration}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
              bg-white/10 backdrop-blur-xl border border-white/20
              hover:bg-white/20 hover:border-white/40
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Apply
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {/* File name display */}
          {displayFileName && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-xl
              bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent
              border border-white/10">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{displayFileName}</p>
                <p className="text-zinc-500 text-xs">{formatTime(duration)} total</p>
              </div>
            </div>
          )}

          {/* Info bar */}
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-zinc-400">
              Select up to {maxDuration}s
            </span>
            <span className={cn(
              "font-medium px-2 py-0.5 rounded-full text-xs",
              selectionDuration > maxDuration 
                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                : "bg-white/10 text-white border border-white/20"
            )}>
              {formatTime(selectionDuration)} selected
            </span>
          </div>

          {/* Waveform */}
          <div 
            ref={waveformRef}
            className="relative h-28 sm:h-32 rounded-xl overflow-hidden select-none touch-none
              bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent
              backdrop-blur-sm border border-white/10
              shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Waveform bars */}
                <div className="absolute inset-0 flex items-center justify-around px-1">
                  {waveform.map((peak, i) => {
                    const time = (i / waveform.length) * duration;
                    const isInSelection = time >= trimStart && time <= trimEnd;
                    const isPlayed = time <= currentTime;
                    
                    return (
                      <div
                        key={i}
                        className={cn(
                          "w-0.5 sm:w-1 rounded-full transition-colors duration-150",
                          isInSelection
                            ? isPlayed
                              ? 'bg-white'
                              : 'bg-white/60'
                            : 'bg-zinc-700'
                        )}
                        style={{ height: `${Math.max(8, peak * 100)}%` }}
                      />
                    );
                  })}
                </div>

                {/* Non-selected overlay - left */}
                <div
                  className="absolute inset-y-0 left-0 bg-black/60"
                  style={{ width: `${getPositionFromTime(trimStart)}%` }}
                />

                {/* Non-selected overlay - right */}
                <div
                  className="absolute inset-y-0 right-0 bg-black/60"
                  style={{ width: `${100 - getPositionFromTime(trimEnd)}%` }}
                />

                {/* Selection window */}
                <div
                  className="absolute inset-y-0 border-2 border-white cursor-move"
                  style={{
                    left: `${getPositionFromTime(trimStart)}%`,
                    right: `${100 - getPositionFromTime(trimEnd)}%`,
                  }}
                  onMouseDown={e => handleMouseDown(e, 'window')}
                  onTouchStart={e => handleMouseDown(e, 'window')}
                >
                  {/* Start handle */}
                  <div
                    className="absolute left-0 inset-y-0 w-4 sm:w-3 -ml-2 sm:-ml-1.5 cursor-ew-resize flex items-center justify-center group touch-none"
                    onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, 'start'); }}
                    onTouchStart={e => { e.stopPropagation(); handleMouseDown(e, 'start'); }}
                  >
                    <div className="w-1 h-10 sm:h-8 bg-white rounded-full group-hover:bg-zinc-200 group-active:bg-zinc-300 transition-colors shadow-lg" />
                  </div>

                  {/* End handle */}
                  <div
                    className="absolute right-0 inset-y-0 w-4 sm:w-3 -mr-2 sm:-mr-1.5 cursor-ew-resize flex items-center justify-center group touch-none"
                    onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, 'end'); }}
                    onTouchStart={e => { e.stopPropagation(); handleMouseDown(e, 'end'); }}
                  >
                    <div className="w-1 h-10 sm:h-8 bg-white rounded-full group-hover:bg-zinc-200 group-active:bg-zinc-300 transition-colors shadow-lg" />
                  </div>
                </div>

                {/* Playhead */}
                {currentTime >= trimStart && currentTime <= trimEnd && (
                  <div
                    className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)] pointer-events-none"
                    style={{ left: `${getPositionFromTime(currentTime)}%` }}
                  />
                )}
              </>
            )}
          </div>

          {/* Time labels */}
          <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
            <span>{formatTime(trimStart)}</span>
            <span>{formatTime(trimEnd)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mt-6">
            {/* Play/Pause button */}
            <button
              onClick={togglePlayPause}
              disabled={isLoading}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105
                bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white ml-0.5" />
              )}
            </button>
          </div>

          {/* Playback Speed Controls */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="text-xs text-zinc-500 mr-1">Speed:</span>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
                  playbackSpeed === speed
                    ? "bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white hover:border-white/20"
                )}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="hidden sm:flex items-center justify-center gap-4 mt-4 text-[10px] text-zinc-600">
            <span><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">Space</kbd> Play/Pause</span>
            <span><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">←→</kbd> Move window</span>
            <span><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">Shift</kbd> Faster</span>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
