import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Mic, Square, Trash2, Play, Pause, Upload, Music, Loader2, Paintbrush, Crop, Scissors } from 'lucide-react';
import nailIcon from '@/assets/icons/nail-icon.png';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { MediaFile, AudioFile } from '../types';
import type { FilterSettings, CropSettings } from '../types/filters';
import { AudioVisualizer } from '@/components/app/audio';
import { FilterEditor } from './FilterEditor';
import { CropRotateEditor } from './CropRotateEditor';
import { AudioTrimmer } from './AudioTrimmer';
import { VideoTrimmer } from './VideoTrimmer';
import { generateFilterCSS } from '@/lib/filters';

interface PostMediaPreviewProps {
  media: MediaFile[];
  onRemove: (index: number) => void;
  onAddAudio: (index: number, audio: AudioFile) => void;
  onRemoveAudio: (index: number) => void;
  onToggleMusicVideo?: (index: number) => void;
  onAddThumbnail?: (index: number, thumbnailUrl: string) => void;
  onRemoveThumbnail?: (index: number) => void;
  onApplyFilter?: (index: number, settings: FilterSettings, presetId?: string) => void;
  onClearFilter?: (index: number) => void;
  onApplyCrop?: (index: number, settings: CropSettings) => void;
  onClearCrop?: (index: number) => void;
  onApplyTrim?: (index: number, trimStart: number, trimEnd: number) => void;
}

const MAX_DURATION = 30; // 30 seconds max

// Helper to check if crop is applied
function hasCropApplied(settings?: CropSettings): boolean {
  if (!settings) return false;
  return settings.rotation !== 0 || settings.flipX || settings.flipY || settings.aspectRatio !== '1:1';
}

// Generate transform CSS from crop settings
function generateCropTransform(settings?: CropSettings): string | undefined {
  if (!settings) return undefined;
  const transforms: string[] = [];
  
  if (settings.rotation !== 0) {
    transforms.push(`rotate(${settings.rotation}deg)`);
  }
  if (settings.flipX) {
    transforms.push('scaleX(-1)');
  }
  if (settings.flipY) {
    transforms.push('scaleY(-1)');
  }
  
  return transforms.length > 0 ? transforms.join(' ') : undefined;
}

export function PostMediaPreview({ 
  media, 
  onRemove, 
  onAddAudio, 
  onRemoveAudio, 
  onToggleMusicVideo,
  onAddThumbnail,
  onRemoveThumbnail,
  onApplyFilter,
  onClearFilter,
  onApplyCrop,
  onClearCrop,
  onApplyTrim,
}: PostMediaPreviewProps) {
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [showAudioOptions, setShowAudioOptions] = useState<number | null>(null);
  const [playingVideoIndex, setPlayingVideoIndex] = useState<number | null>(null);
  const [processingVideos, setProcessingVideos] = useState<Map<number, number>>(new Map());
  const [filterEditorIndex, setFilterEditorIndex] = useState<number | null>(null);
  const [cropEditorIndex, setCropEditorIndex] = useState<number | null>(null);
  const [videoTrimmerIndex, setVideoTrimmerIndex] = useState<number | null>(null);
  const [videoFrames, setVideoFrames] = useState<Map<number, string[]>>(new Map());
  const [extractingFrames, setExtractingFrames] = useState<Set<number>>(new Set());
  const [fullscreenPreview, setFullscreenPreview] = useState<{ index: number; src: string; type: 'image' | 'video'; filterSettings?: FilterSettings; cropSettings?: CropSettings; currentTime?: number } | null>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [audioTrimmerData, setAudioTrimmerData] = useState<{
    index: number;
    file: File;
    url: string;
    duration: number;
    fileName: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadIndex = useRef<number | null>(null);
  const pendingThumbnailIndex = useRef<number | null>(null);
  const recordingTimeRef = useRef(0);

  // Simulate video processing when video is added
  useEffect(() => {
    media.forEach((m, index) => {
      if (m.type === 'video' && !processingVideos.has(index)) {
        // Start simulated processing for new videos
        setProcessingVideos(prev => new Map(prev).set(index, 0));
        
        const interval = setInterval(() => {
          setProcessingVideos(prev => {
            const current = prev.get(index) ?? 0;
            if (current >= 100) {
              clearInterval(interval);
              const next = new Map(prev);
              next.delete(index);
              return next;
            }
            return new Map(prev).set(index, Math.min(current + Math.random() * 15 + 5, 100));
          });
        }, 200);

        return () => clearInterval(interval);
      }
    });
  }, [media.length]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const startRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        // Use ref value to capture correct duration
        onAddAudio(index, { blob, url, duration: recordingTimeRef.current });
        stream.getTracks().forEach(track => track.stop());
        setRecordingIndex(null);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
      };

      mediaRecorder.start();
      setRecordingIndex(index);
      setRecordingTime(0);
      recordingTimeRef.current = 0;

      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
        
        if (recordingTimeRef.current >= MAX_DURATION) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const playAudio = (url: string, index: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(url);
    audioRef.current.onended = () => setPlayingIndex(null);
    audioRef.current.play();
    setPlayingIndex(index);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingIndex(null);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const index = pendingUploadIndex.current;
    if (!file || index === null) return;

    // Create audio element to get duration
    const audioEl = document.createElement('audio');
    audioEl.src = URL.createObjectURL(file);
    
    audioEl.onloadedmetadata = () => {
      const duration = Math.round(audioEl.duration);
      
      if (duration > MAX_DURATION) {
        // Open audio trimmer for long audio files
        setAudioTrimmerData({
          index,
          file,
          url: audioEl.src,
          duration,
          fileName: file.name,
        });
        setShowAudioOptions(null);
        return;
      }

      const url = audioEl.src;
      onAddAudio(index, { blob: file, url, duration });
      setShowAudioOptions(null);
    };

    audioEl.onerror = () => {
      toast.error('Failed to load audio file');
      URL.revokeObjectURL(audioEl.src);
    };

    e.target.value = '';
    pendingUploadIndex.current = null;
  };

  const triggerAudioUpload = (index: number) => {
    pendingUploadIndex.current = index;
    audioInputRef.current?.click();
    setShowAudioOptions(null);
  };

  const handleStartRecording = (index: number) => {
    setShowAudioOptions(null);
    startRecording(index);
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const index = pendingThumbnailIndex.current;
    if (!file || index === null) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const url = URL.createObjectURL(file);
    onAddThumbnail?.(index, url);
    e.target.value = '';
    pendingThumbnailIndex.current = null;
  };

  const triggerThumbnailUpload = (index: number) => {
    pendingThumbnailIndex.current = index;
    thumbnailInputRef.current?.click();
  };

  // Extract frames from video for thumbnail selection
  const extractVideoFrames = useCallback(async (videoUrl: string, index: number) => {
    if (extractingFrames.has(index)) return;
    
    setExtractingFrames(prev => new Set(prev).add(index));
    
    try {
      const video = document.createElement('video');
      video.src = videoUrl;
      // Only set crossOrigin for non-blob URLs (external resources)
      // Blob URLs are same-origin and don't need CORS handling
      if (!videoUrl.startsWith('blob:')) {
        video.crossOrigin = 'anonymous';
      }
      video.preload = 'auto'; // Use 'auto' instead of 'metadata' for better compatibility
      video.muted = true; // Required for autoplay policies
      
      // Wait for video to be ready to play (better for WebM/recorded videos)
      await new Promise<void>((resolve, reject) => {
        const handleCanPlay = () => {
          video.removeEventListener('canplaythrough', handleCanPlay);
          video.removeEventListener('error', handleError);
          resolve();
        };
        const handleError = () => {
          video.removeEventListener('canplaythrough', handleCanPlay);
          video.removeEventListener('error', handleError);
          reject(new Error('Failed to load video'));
        };
        video.addEventListener('canplaythrough', handleCanPlay);
        video.addEventListener('error', handleError);
        video.load();
        setTimeout(() => {
          video.removeEventListener('canplaythrough', handleCanPlay);
          video.removeEventListener('error', handleError);
          reject(new Error('Video load timeout'));
        }, 15000);
      });
      
      const duration = video.duration;
      if (!duration || duration <= 0 || !isFinite(duration)) {
        throw new Error('Invalid video duration');
      }
      
      const frameCount = 20;
      const frames: string[] = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      canvas.width = 640;
      canvas.height = 360;
      
      for (let i = 0; i < frameCount; i++) {
        // Include first frame (time 0) and distribute remaining frames evenly
        const time = i === 0 ? 0.01 : (duration / (frameCount - 1)) * i; // Use 0.01 instead of 0 for better compatibility
        video.currentTime = Math.min(time, duration - 0.1); // Don't seek past the end
        
        await new Promise<void>((resolve) => {
          const handleSeeked = () => {
            video.removeEventListener('seeked', handleSeeked);
            // Small delay to ensure frame is rendered
            setTimeout(resolve, 50);
          };
          video.addEventListener('seeked', handleSeeked);
          // Fallback timeout in case seeked never fires (common with some WebM)
          setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
            resolve();
          }, 500);
        });
        
        // Check if video has valid dimensions
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const blob = await new Promise<Blob | null>(resolve => 
            canvas.toBlob(resolve, 'image/jpeg', 0.7)
          );
          
          if (blob && blob.size > 1000) { // Only add if blob has actual content
            frames.push(URL.createObjectURL(blob));
          }
        }
      }
      
      // Only set frames if we got at least some
      if (frames.length > 0) {
        setVideoFrames(prev => new Map(prev).set(index, frames));
      } else {
        console.warn('No frames could be extracted from video');
      }
    } catch (error) {
      console.error('Failed to extract video frames:', error);
    } finally {
      setExtractingFrames(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  }, [extractingFrames]);

  // Track video URLs to detect changes
  const videoUrlsRef = useRef<Map<number, string>>(new Map());

  // Trigger frame extraction when video is added or changed
  useEffect(() => {
    const currentUrls = new Map<number, string>();
    
    media.forEach((m, index) => {
      if (m.type === 'video') {
        currentUrls.set(index, m.preview);
        const previousUrl = videoUrlsRef.current.get(index);
        
        // If video changed or is new, clear old frames and extract new ones
        if (previousUrl !== m.preview) {
          // Revoke old frame URLs if they exist
          const oldFrames = videoFrames.get(index);
          if (oldFrames) {
            oldFrames.forEach(url => URL.revokeObjectURL(url));
            setVideoFrames(prev => {
              const next = new Map(prev);
              next.delete(index);
              return next;
            });
          }
        }
        
        // Extract frames if not already done
        if (!videoFrames.has(index) && !extractingFrames.has(index)) {
          extractVideoFrames(m.preview, index);
        }
      }
    });
    
    // Update tracked URLs
    videoUrlsRef.current = currentUrls;
    
    // Clean up frames for removed videos
    videoFrames.forEach((frames, index) => {
      if (!currentUrls.has(index)) {
        frames.forEach(url => URL.revokeObjectURL(url));
        setVideoFrames(prev => {
          const next = new Map(prev);
          next.delete(index);
          return next;
        });
      }
    });
  }, [media, extractVideoFrames, videoFrames, extractingFrames]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      videoFrames.forEach(frames => {
        frames.forEach(url => URL.revokeObjectURL(url));
      });
    };
  }, []);

  if (media.length === 0) return null;

  return (
    <>
      {/* Hidden audio input */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioUpload}
      />
      {/* Hidden thumbnail input */}
      <input
        ref={thumbnailInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleThumbnailUpload}
      />
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-2"
        >
          {/* Horizontal scroll container with touch swipe */}
          <div 
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 -mb-2 touch-pan-x"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {media.map((m, index) => (
              <div key={index} className="relative flex-shrink-0 snap-center">
                {m.type === 'image' ? (
                  /* ==================== IMAGE PREVIEW ==================== */
                  <div className="relative h-[160px] sm:h-[200px] md:h-[240px] rounded-2xl overflow-hidden bg-zinc-900">
                    <div className="relative h-full flex items-center justify-center">
                      <img 
                        src={m.preview} 
                        alt="" 
                        className="h-full w-auto max-w-none object-contain rounded-2xl cursor-pointer" 
                        style={{ 
                          filter: m.filterSettings ? generateFilterCSS(m.filterSettings) : undefined,
                          transform: generateCropTransform(m.cropSettings),
                        }}
                        onClick={() => setFullscreenPreview({ 
                          index, 
                          src: m.preview, 
                          type: 'image',
                          filterSettings: m.filterSettings,
                          cropSettings: m.cropSettings
                        })}
                      />
                    
                      {/* Top left: Filter + Crop + Audio buttons */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setFilterEditorIndex(index); }}
                              className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                bg-black/60 backdrop-blur-xl border border-white/20
                                hover:bg-black/70 hover:border-white/40"
                            >
                              <Paintbrush className="w-3 h-3 text-white" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Edit filters</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCropEditorIndex(index); }}
                              className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                bg-black/60 backdrop-blur-xl border border-white/20
                                hover:bg-black/70 hover:border-white/40"
                            >
                              <Crop className="w-3 h-3 text-white" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Crop & rotate</TooltipContent>
                        </Tooltip>
                        
                        {/* Audio controls for images */}
                        {recordingIndex === index ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                            className="flex items-center gap-2 bg-red-500 px-3 py-1.5 rounded-xl text-white text-xs font-medium animate-pulse"
                          >
                            <Square className="w-3 h-3 fill-white" />
                            {recordingTime}s / {MAX_DURATION}s
                          </button>
                        ) : m.audio ? (
                          <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-xl" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => { e.stopPropagation(); playingIndex === index ? stopAudio() : playAudio(m.audio!.url, index); }}
                              className="w-6 h-6 flex items-center justify-center text-white"
                            >
                              {playingIndex === index ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <span className="text-white text-xs">{m.audio.duration}s</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onRemoveAudio(index); }}
                              className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : showAudioOptions === index ? (
                          <>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); triggerAudioUpload(index); }}
                                  className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                    bg-black/60 backdrop-blur-xl border border-white/20
                                    hover:bg-blue-500/40 hover:border-blue-400/40"
                                >
                                  <Upload className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Upload audio</TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleStartRecording(index); }}
                                  className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                    bg-black/60 backdrop-blur-xl border border-white/20
                                    hover:bg-red-500/40 hover:border-red-400/40"
                                >
                                  <Mic className="w-3 h-3 text-white" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Record audio</TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setShowAudioOptions(null); }}
                                  className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                    bg-black/60 backdrop-blur-xl border border-white/20
                                    hover:bg-black/70 hover:border-white/40"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Cancel</TooltipContent>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setShowAudioOptions(index); }}
                                className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                  bg-black/60 backdrop-blur-xl border border-white/20
                                  hover:bg-black/70 hover:border-white/40"
                              >
                                <Music className="w-3 h-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Add audio</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      
                      {/* Remove button */}
                      <button
                        onClick={() => onRemove(index)}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black rounded-xl transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                ) : m.type === 'audio' ? (
                  /* ==================== AUDIO PREVIEW ==================== */
                  <div className="relative w-full sm:w-[320px] md:w-[360px] rounded-2xl overflow-hidden bg-zinc-900">
                    <div className="relative h-full flex items-center justify-center">
                      <AudioVisualizer
                        audioUrl={m.preview}
                        isPlaying={playingIndex === index}
                        onPlayPause={() => setPlayingIndex(prev => prev === index ? null : index)}
                        className="h-full w-auto min-w-[200px] aspect-[2/1]"
                        showStylePicker={true}
                      />
                      
                      <div className="absolute top-3 left-3 right-3 flex items-center gap-3 pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/40 to-blue-500/40 backdrop-blur-sm flex items-center justify-center border border-white/20">
                          <Music className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate drop-shadow-lg">{m.file.name}</p>
                          <p className="text-white/70 text-xs drop-shadow">
                            {m.duration ? `${Math.floor(m.duration / 60)}:${String(Math.floor(m.duration % 60)).padStart(2, '0')}` : 'Audio'}
                          </p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => onRemove(index)}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black rounded-xl transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                ) : m.type === 'video' ? (
                  /* ==================== VIDEO + THUMBNAIL STACKED ==================== */
                  <div className="flex flex-col gap-3">
                    {/* Video preview container */}
                    <div className="relative aspect-video w-[280px] sm:w-[320px] md:w-[380px] rounded-2xl overflow-hidden bg-zinc-900">
                      {/* Processing overlay */}
                      {processingVideos.has(index) && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 rounded-2xl">
                          <Loader2 className="w-8 h-8 text-white animate-spin mb-3" />
                          <p className="text-white text-sm font-medium mb-2">Processing video...</p>
                          <div className="w-3/4 max-w-[200px]">
                            <Progress value={processingVideos.get(index) ?? 0} className="h-2" />
                          </div>
                          <p className="text-zinc-400 text-xs mt-1">{Math.round(processingVideos.get(index) ?? 0)}%</p>
                        </div>
                      )}
                      
                      {/* Always show video */}
                      <video 
                        ref={(el) => {
                          if (el) videoRefs.current.set(index, el);
                        }}
                        src={m.preview} 
                        className="w-full h-full object-cover rounded-2xl pointer-events-none"
                        style={{ 
                          filter: m.filterSettings ? generateFilterCSS(m.filterSettings) : undefined,
                          transform: generateCropTransform(m.cropSettings),
                        }}
                        onEnded={() => setPlayingVideoIndex(null)}
                        onPause={() => {
                          if (playingVideoIndex === index) setPlayingVideoIndex(null);
                        }}
                      />
                      
                      {/* Play/Pause overlay */}
                      {!processingVideos.has(index) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const video = videoRefs.current.get(index);
                            if (!video) return;
                            
                            if (playingVideoIndex === index) {
                              video.pause();
                              setPlayingVideoIndex(null);
                            } else {
                              videoRefs.current.forEach((v, i) => {
                                if (i !== index) v.pause();
                              });
                              video.play();
                              setPlayingVideoIndex(index);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            const video = videoRefs.current.get(index);
                            const currentTime = video?.currentTime || 0;
                            if (video) video.pause();
                            setPlayingVideoIndex(null);
                            setFullscreenPreview({ 
                              index, 
                              src: m.preview, 
                              type: 'video',
                              filterSettings: m.filterSettings,
                              cropSettings: m.cropSettings,
                              currentTime
                            });
                          }}
                          className="absolute inset-0 flex items-center justify-center group cursor-pointer"
                        >
                          <div className={`w-12 h-12 rounded-xl bg-black/60 flex items-center justify-center transition-opacity ${
                            playingVideoIndex === index ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                          }`}>
                            {playingVideoIndex === index ? (
                              <Pause className="w-6 h-6 text-white" />
                            ) : (
                              <Play className="w-6 h-6 text-white fill-white" />
                            )}
                          </div>
                        </button>
                      )}
                      
                      {/* Top left: Filter + Crop + Trim buttons */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setFilterEditorIndex(index); }}
                              className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                bg-black/60 backdrop-blur-xl border border-white/20
                                hover:bg-black/70 hover:border-white/40"
                            >
                              <Paintbrush className="w-3 h-3 text-white" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Edit filters</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCropEditorIndex(index); }}
                              className="flex items-center justify-center w-7 h-7 rounded-xl text-white transition-all duration-300 hover:scale-105
                                bg-black/60 backdrop-blur-xl border border-white/20
                                hover:bg-black/70 hover:border-white/40"
                            >
                              <Crop className="w-3 h-3 text-white" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Crop & rotate</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setVideoTrimmerIndex(index); }}
                              className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-300 hover:scale-105
                                ${m.trimStart !== undefined || m.trimEnd !== undefined
                                  ? 'bg-black/70 text-white backdrop-blur-xl border border-white/40'
                                  : 'bg-black/60 backdrop-blur-xl border border-white/20 text-white hover:bg-black/70 hover:border-white/40'
                                }`}
                            >
                              <Scissors className="w-3 h-3 text-white" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Trim video</TooltipContent>
                        </Tooltip>
                      </div>
                      
                      {/* Duration badge */}
                      {m.duration && (
                        <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white pointer-events-none">
                          {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                          {m.duration < 90 && <span className="ml-1 text-emerald-400">• Short</span>}
                        </div>
                      )}
                      
                      {/* Bottom right: Music Video Toggle */}
                      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onToggleMusicVideo?.(index); }}
                              className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-300 hover:scale-105
                                ${m.isMusicVideo 
                                  ? 'bg-white/20 text-white backdrop-blur-xl border border-white/30' 
                                  : 'bg-black/60 backdrop-blur-xl border border-white/20 text-white hover:bg-black/70 hover:border-white/40'
                                }`}
                            >
                              <Music className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Mark as music video</TooltipContent>
                        </Tooltip>
                      </div>
                      
                      {/* Remove button */}
                      <button
                        onClick={() => onRemove(index)}
                        className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black rounded-xl transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                    
                    {/* Thumbnail preview - same dimensions as video with drag & drop */}
                    <div 
                      className="relative aspect-video w-[280px] sm:w-[320px] md:w-[380px] rounded-2xl overflow-hidden bg-zinc-900 border-2 border-dashed border-white/20 hover:border-white/40 transition-colors cursor-pointer group"
                      onClick={() => triggerThumbnailUpload(index)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.add('border-white', 'bg-white/10');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove('border-white', 'bg-white/10');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.classList.remove('border-white', 'bg-white/10');
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          const url = URL.createObjectURL(file);
                          onAddThumbnail?.(index, url);
                        } else if (file) {
                          toast.error('Please drop an image file');
                        }
                      }}
                    >
                      {m.thumbnail ? (
                        <>
                          <img 
                            src={m.thumbnail} 
                            alt="Thumbnail" 
                            className="w-full h-full object-cover"
                          />
                          {/* Overlay on hover */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Upload className="w-6 h-6 text-white" />
                          </div>
                          {/* Remove thumbnail */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRemoveThumbnail?.(index); }}
                            className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-500/80 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/50">
                          <Upload className="w-8 h-8" />
                          <span className="text-sm">Drop image or click</span>
                        </div>
                      )}
                      {/* Label */}
                      <div className="absolute bottom-2 left-2">
                        <span className="text-xs text-white/70 font-medium bg-black/60 px-2 py-1 rounded-lg">Thumbnail</span>
                      </div>
                    </div>
                    
                    {/* Frame Selection Strip */}
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 w-[280px] sm:w-[320px] md:w-[380px]">
                      {/* Upload button */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); triggerThumbnailUpload(index); }}
                        className="flex-shrink-0 w-16 h-9 rounded-lg bg-zinc-800 border border-white/20 hover:border-white/40 flex items-center justify-center transition-colors"
                      >
                        <Upload className="w-4 h-4 text-white/60" />
                      </button>
                      
                      {/* Loading indicator */}
                      {extractingFrames.has(index) && (
                        <div className="flex-shrink-0 w-16 h-9 rounded-lg bg-zinc-800 border border-white/20 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                        </div>
                      )}
                      
                      {/* Frame thumbnails */}
                      {videoFrames.get(index)?.map((frameUrl, frameIndex) => (
                        <button
                          key={frameIndex}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onAddThumbnail?.(index, frameUrl); }}
                          className={`flex-shrink-0 w-16 h-9 rounded-lg overflow-hidden border-2 transition-colors ${
                            m.thumbnail === frameUrl 
                              ? 'border-white' 
                              : 'border-transparent hover:border-white/50'
                          }`}
                        >
                          <img src={frameUrl} alt={`Frame ${frameIndex + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Filter Editor Modal - works for both images and videos */}
      {filterEditorIndex !== null && (media[filterEditorIndex]?.type === 'image' || media[filterEditorIndex]?.type === 'video') && (
        <FilterEditor
          isOpen={true}
          onClose={() => setFilterEditorIndex(null)}
          imageUrl={media[filterEditorIndex].type === 'video' 
            ? media[filterEditorIndex].thumbnail || media[filterEditorIndex].preview 
            : media[filterEditorIndex].preview}
          isVideo={media[filterEditorIndex].type === 'video' && !media[filterEditorIndex].thumbnail}
          initialSettings={media[filterEditorIndex].filterSettings}
          initialPresetId={media[filterEditorIndex].filterPresetId}
          onApply={(settings, presetId) => {
            onApplyFilter?.(filterEditorIndex, settings, presetId);
            setFilterEditorIndex(null);
          }}
        />
      )}

      {/* Crop/Rotate Editor Modal - works for both images and videos */}
      {cropEditorIndex !== null && (media[cropEditorIndex]?.type === 'image' || media[cropEditorIndex]?.type === 'video') && (
        <CropRotateEditor
          isOpen={true}
          onClose={() => setCropEditorIndex(null)}
          imageUrl={media[cropEditorIndex].type === 'video' 
            ? media[cropEditorIndex].thumbnail || media[cropEditorIndex].preview 
            : media[cropEditorIndex].preview}
          initialSettings={media[cropEditorIndex].cropSettings}
          onApply={(settings) => {
            onApplyCrop?.(cropEditorIndex, settings);
            setCropEditorIndex(null);
          }}
        />
      )}

      {/* Audio Trimmer Modal */}
      {audioTrimmerData && (
        <AudioTrimmer
          isOpen={true}
          onClose={() => {
            URL.revokeObjectURL(audioTrimmerData.url);
            setAudioTrimmerData(null);
          }}
          audioUrl={audioTrimmerData.url}
          audioBlob={audioTrimmerData.file}
          duration={audioTrimmerData.duration}
          maxDuration={MAX_DURATION}
          fileName={audioTrimmerData.fileName}
          onApply={(trimmedBlob, trimStart, trimEnd) => {
            const trimmedUrl = URL.createObjectURL(trimmedBlob);
            const trimmedDuration = trimEnd - trimStart;
            onAddAudio(audioTrimmerData.index, {
              blob: trimmedBlob,
              url: trimmedUrl,
              duration: trimmedDuration,
              trimStart,
              trimEnd,
              originalDuration: audioTrimmerData.duration,
            });
            URL.revokeObjectURL(audioTrimmerData.url);
            setAudioTrimmerData(null);
          }}
        />
      )}

      {/* Video Trimmer Modal */}
      {videoTrimmerIndex !== null && media[videoTrimmerIndex]?.type === 'video' && (
        <VideoTrimmer
          isOpen={true}
          onClose={() => setVideoTrimmerIndex(null)}
          videoUrl={media[videoTrimmerIndex].preview}
          duration={media[videoTrimmerIndex].duration || 0}
          fileName={media[videoTrimmerIndex].file.name}
          onApply={(trimStart, trimEnd) => {
            onApplyTrim?.(videoTrimmerIndex, trimStart, trimEnd);
            setVideoTrimmerIndex(null);
          }}
        />
      )}

      {/* Fullscreen Preview Modal */}
      <AnimatePresence>
        {fullscreenPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={() => setFullscreenPreview(null)}
          >
            {/* Blurred backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            
            {/* Close button */}
            <button
              className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-colors"
              onClick={() => setFullscreenPreview(null)}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Media content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {fullscreenPreview.type === 'image' ? (
                <img
                  src={fullscreenPreview.src}
                  alt=""
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  style={{
                    filter: fullscreenPreview.filterSettings ? generateFilterCSS(fullscreenPreview.filterSettings) : undefined,
                    transform: generateCropTransform(fullscreenPreview.cropSettings),
                  }}
                />
              ) : (
                <video
                  ref={fullscreenVideoRef}
                  src={fullscreenPreview.src}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  style={{
                    filter: fullscreenPreview.filterSettings ? generateFilterCSS(fullscreenPreview.filterSettings) : undefined,
                    transform: generateCropTransform(fullscreenPreview.cropSettings),
                  }}
                  controls
                  autoPlay
                  onLoadedMetadata={() => {
                    if (fullscreenVideoRef.current && fullscreenPreview.currentTime) {
                      fullscreenVideoRef.current.currentTime = fullscreenPreview.currentTime;
                    }
                  }}
                />
              )}
            </motion.div>

            {/* Image counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 text-white text-sm">
              {fullscreenPreview.index + 1} / {media.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
