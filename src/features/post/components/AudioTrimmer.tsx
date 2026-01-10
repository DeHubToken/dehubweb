import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, Pause, Scissors } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateWaveformFromBlob, sliceAudioBlob, formatTime } from '@/lib/audio-waveform';
import { toast } from 'sonner';

interface AudioTrimmerProps {
  isOpen: boolean;
  onClose: () => void;
  audioUrl: string;
  audioBlob: Blob;
  duration: number;
  maxDuration: number;
  onApply: (trimmedBlob: Blob, trimStart: number, trimEnd: number) => void;
}

export function AudioTrimmer({
  isOpen,
  onClose,
  audioUrl,
  audioBlob,
  duration,
  maxDuration,
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

  const togglePlayPause = () => {
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
  };

  const getPositionFromTime = (time: number): number => {
    return (time / duration) * 100;
  };

  const getTimeFromPosition = (clientX: number): number => {
    if (!waveformRef.current) return 0;
    const rect = waveformRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * duration;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'window') => {
    e.preventDefault();
    setIsDragging(type);
    dragStartX.current = e.clientX;
    dragStartTrim.current = { start: trimStart, end: trimEnd };
  }, [trimStart, trimEnd]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !waveformRef.current) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX.current;
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
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl bg-zinc-900/95 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Scissors className="w-5 h-5 text-purple-400" />
              <h3 className="text-white font-semibold">Trim Audio</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Info */}
            <div className="flex items-center justify-between mb-4 text-sm">
              <span className="text-zinc-400">
                Select up to {maxDuration} seconds of audio
              </span>
              <span className={`font-medium ${selectionDuration > maxDuration ? 'text-red-400' : 'text-emerald-400'}`}>
                {formatTime(selectionDuration)} selected
              </span>
            </div>

            {/* Waveform */}
            <div 
              ref={waveformRef}
              className="relative h-32 bg-zinc-800/50 rounded-xl overflow-hidden select-none"
            >
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
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
                          className={`w-0.5 rounded-full transition-colors ${
                            isInSelection
                              ? isPlayed
                                ? 'bg-purple-400'
                                : 'bg-purple-400/60'
                              : 'bg-zinc-600'
                          }`}
                          style={{ height: `${Math.max(4, peak * 100)}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Non-selected overlay - left */}
                  <div
                    className="absolute inset-y-0 left-0 bg-black/50"
                    style={{ width: `${getPositionFromTime(trimStart)}%` }}
                  />

                  {/* Non-selected overlay - right */}
                  <div
                    className="absolute inset-y-0 right-0 bg-black/50"
                    style={{ width: `${100 - getPositionFromTime(trimEnd)}%` }}
                  />

                  {/* Selection window */}
                  <div
                    className="absolute inset-y-0 border-2 border-purple-400 cursor-move"
                    style={{
                      left: `${getPositionFromTime(trimStart)}%`,
                      right: `${100 - getPositionFromTime(trimEnd)}%`,
                    }}
                    onMouseDown={e => handleMouseDown(e, 'window')}
                  >
                    {/* Start handle */}
                    <div
                      className="absolute left-0 inset-y-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center group"
                      onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, 'start'); }}
                    >
                      <div className="w-1 h-8 bg-purple-400 rounded-full group-hover:bg-purple-300 transition-colors" />
                    </div>

                    {/* End handle */}
                    <div
                      className="absolute right-0 inset-y-0 w-3 -mr-1.5 cursor-ew-resize flex items-center justify-center group"
                      onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, 'end'); }}
                    >
                      <div className="w-1 h-8 bg-purple-400 rounded-full group-hover:bg-purple-300 transition-colors" />
                    </div>
                  </div>

                  {/* Playhead */}
                  {currentTime >= trimStart && currentTime <= trimEnd && (
                    <div
                      className="absolute inset-y-0 w-0.5 bg-white pointer-events-none"
                      style={{ left: `${getPositionFromTime(currentTime)}%` }}
                    />
                  )}
                </>
              )}
            </div>

            {/* Time labels */}
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
              <span>{formatTime(trimStart)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={togglePlayPause}
                disabled={isLoading}
                className="w-12 h-12 rounded-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isLoading || isProcessing || selectionDuration > maxDuration}
              className="px-4 py-2 text-sm bg-purple-500 hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  Apply Trim
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
