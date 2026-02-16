import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, Pause, Scissors, Check, Film } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VideoTrimmerProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  duration: number;
  fileName?: string;
  onApply: (trimStart: number, trimEnd: number) => void;
}

const PLAYBACK_SPEEDS = [0.1, 0.2, 0.3, 0.4, 0.5, 1, 1.5, 2] as const;
type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

const ARROW_STEP = 0.5;
const SHIFT_ARROW_STEP = 2;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function VideoTrimmer({
  isOpen,
  onClose,
  videoUrl,
  duration,
  fileName,
  onApply,
}: VideoTrimmerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'window' | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartTrim = useRef({ start: 0, end: 0 });

  // Generate video thumbnails for timeline
  useEffect(() => {
    if (!isOpen || !videoUrl) return;
    
    setIsGeneratingThumbnails(true);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    
    const thumbCount = 10;
    const thumbs: string[] = [];
    
    video.onloadedmetadata = async () => {
      canvas.width = 80;
      canvas.height = 45;
      
      for (let i = 0; i < thumbCount; i++) {
        const time = (i / thumbCount) * video.duration;
        video.currentTime = time;
        
        await new Promise<void>((resolve) => {
          video.onseeked = () => {
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
            }
            resolve();
          };
        });
      }
      
      setThumbnails(thumbs);
      setIsGeneratingThumbnails(false);
    };
    
    video.onerror = () => {
      setIsGeneratingThumbnails(false);
    };
  }, [isOpen, videoUrl]);

  // Update playback speed when changed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
            const newStart = Math.max(0, trimStart - step);
            setTrimStart(newStart);
          } else if (e.metaKey || e.ctrlKey) {
            const newEnd = Math.max(trimStart + 1, trimEnd - step);
            setTrimEnd(newEnd);
          } else {
            const newStart = Math.max(0, trimStart - step);
            const shift = trimStart - newStart;
            setTrimStart(newStart);
            setTrimEnd(trimEnd - shift);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.altKey) {
            const newStart = Math.min(trimEnd - 1, trimStart + step);
            setTrimStart(newStart);
          } else if (e.metaKey || e.ctrlKey) {
            const newEnd = Math.min(duration, trimEnd + step);
            setTrimEnd(newEnd);
          } else {
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
  }, [isOpen, trimStart, trimEnd, duration]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    
    if (time >= trimEnd) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime < trimStart || videoRef.current.currentTime >= trimEnd) {
        videoRef.current.currentTime = trimStart;
      }
      videoRef.current.play();
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
    if (!isDragging || !timelineRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = clientX - dragStartX.current;
    const deltaTime = (deltaX / rect.width) * duration;
    
    if (isDragging === 'start') {
      const newStart = Math.max(0, Math.min(trimEnd - 1, dragStartTrim.current.start + deltaTime));
      setTrimStart(newStart);
    } else if (isDragging === 'end') {
      const newEnd = Math.max(trimStart + 1, Math.min(duration, dragStartTrim.current.end + deltaTime));
      setTrimEnd(newEnd);
    } else if (isDragging === 'window') {
      const windowDuration = dragStartTrim.current.end - dragStartTrim.current.start;
      let newStart = dragStartTrim.current.start + deltaTime;
      let newEnd = dragStartTrim.current.end + deltaTime;
      
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
  }, [isDragging, duration, trimStart, trimEnd]);

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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newTime = (x / rect.width) * duration;
    const clampedTime = Math.max(trimStart, Math.min(trimEnd, newTime));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  };

  const handleApply = () => {
    onApply(trimStart, trimEnd);
    onClose();
    toast.success('Video trimmed!');
  };

  const selectionDuration = trimEnd - trimStart;

  const displayFileName = fileName 
    ? fileName.length > 30 
      ? fileName.slice(0, 27) + '...' 
      : fileName
    : null;

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent hideHandle className="bg-zinc-950 border-zinc-800 max-h-[95vh] overflow-hidden flex flex-col">
        <DrawerTitle className="sr-only">Trim Video</DrawerTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
          <span className="text-white font-semibold">Trim Video</span>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-medium transition-all duration-300 hover:scale-105
              bg-white/10 backdrop-blur-xl border border-white/20
              hover:bg-white/20 hover:border-white/40"
          >
            <Check className="w-4 h-4" />
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
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Film className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{displayFileName}</p>
                <p className="text-zinc-500 text-xs">{formatTime(duration)} total</p>
              </div>
            </div>
          )}

          {/* Video Preview */}
          <div className="relative aspect-video mb-4 rounded-xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
            />
            
            {/* Play/Pause overlay button */}
            <button
              onClick={togglePlayPause}
              className="absolute inset-0 flex items-center justify-center group"
            >
              <div className={cn(
                "w-14 h-14 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 transition-all",
                isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
              )}>
                {isPlaying ? (
                  <Pause className="w-7 h-7 text-white fill-white" />
                ) : (
                  <Play className="w-7 h-7 text-white fill-white ml-0.5" />
                )}
              </div>
            </button>
          </div>

          {/* Playback Progress Bar */}
          <div className="mb-4 space-y-2">
            <div 
              className="relative h-1 bg-white/10 rounded-full cursor-pointer"
              onClick={handleSeek}
            >
              {/* Trim region indicator */}
              <div 
                className="absolute h-full bg-white/20 rounded-full"
                style={{
                  left: `${getPositionFromTime(trimStart)}%`,
                  width: `${getPositionFromTime(trimEnd) - getPositionFromTime(trimStart)}%`,
                }}
              />
              {/* Current position */}
              <div 
                className="absolute h-full bg-white rounded-full transition-all"
                style={{ width: `${getPositionFromTime(currentTime)}%` }}
              />
              {/* Playhead */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg transition-all"
                style={{ left: `${getPositionFromTime(currentTime)}%`, marginLeft: '-6px' }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Info bar */}
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-zinc-400">
              Select trim range
            </span>
            <span className="font-medium px-2 py-0.5 rounded-xl text-xs bg-white/10 text-white border border-white/20">
              {formatTime(selectionDuration)} selected
            </span>
          </div>

          {/* Thumbnail Timeline with trim handles */}
          <div 
            ref={timelineRef}
            className="relative h-16 sm:h-20 rounded-xl overflow-hidden select-none touch-none
              bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent
              backdrop-blur-sm border border-white/10
              shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            {isGeneratingThumbnails ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Thumbnails */}
                <div className="absolute inset-0 flex">
                  {thumbnails.map((thumb, i) => (
                    <div
                      key={i}
                      className="flex-1 h-full"
                      style={{
                        backgroundImage: `url(${thumb})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  ))}
                </div>

                {/* Non-selected overlay - left */}
                <div
                  className="absolute inset-y-0 left-0 bg-black/70"
                  style={{ width: `${getPositionFromTime(trimStart)}%` }}
                />

                {/* Non-selected overlay - right */}
                <div
                  className="absolute inset-y-0 right-0 bg-black/70"
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
                    className="absolute left-0 inset-y-0 w-5 sm:w-4 -ml-2.5 sm:-ml-2 cursor-ew-resize flex items-center justify-center group touch-none"
                    onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, 'start'); }}
                    onTouchStart={e => { e.stopPropagation(); handleMouseDown(e, 'start'); }}
                  >
                    <div className="w-1 h-12 sm:h-10 bg-white rounded-full group-hover:bg-zinc-200 group-active:bg-zinc-300 transition-colors shadow-lg" />
                  </div>

                  {/* End handle */}
                  <div
                    className="absolute right-0 inset-y-0 w-5 sm:w-4 -mr-2.5 sm:-mr-2 cursor-ew-resize flex items-center justify-center group touch-none"
                    onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, 'end'); }}
                    onTouchStart={e => { e.stopPropagation(); handleMouseDown(e, 'end'); }}
                  >
                    <div className="w-1 h-12 sm:h-10 bg-white rounded-full group-hover:bg-zinc-200 group-active:bg-zinc-300 transition-colors shadow-lg" />
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
            {/* Playback Speed */}
            <div className="flex items-center gap-1 sm:gap-2">
              {PLAYBACK_SPEEDS.map(speed => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-medium transition-all",
                    playbackSpeed === speed
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  )}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <p className="hidden sm:block text-center text-zinc-600 text-xs mt-4">
            Space: play/pause • Arrow keys: move window • Alt+arrows: adjust start • Ctrl+arrows: adjust end
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
