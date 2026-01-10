import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Mic, Square, Trash2, Play, Pause, Upload, Music, ImageIcon, Loader2, Sparkles, Crop } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { MediaFile, AudioFile } from '../types';
import type { FilterSettings, CropSettings } from '../types/filters';
import { AudioVisualizer } from '@/components/app/audio';
import { FilterEditor } from './FilterEditor';
import { CropRotateEditor } from './CropRotateEditor';
import { generateFilterCSS, hasFilterApplied } from '@/lib/filters';

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
}

const MAX_DURATION = 30; // 30 seconds max

// Helper to check if crop is applied
function hasCropApplied(settings?: CropSettings): boolean {
  if (!settings) return false;
  return settings.rotation !== 0 || settings.flipX || settings.flipY || settings.aspectRatio !== 'free';
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
}: PostMediaPreviewProps) {
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [showAudioOptions, setShowAudioOptions] = useState<number | null>(null);
  const [playingVideoIndex, setPlayingVideoIndex] = useState<number | null>(null);
  const [processingVideos, setProcessingVideos] = useState<Map<number, number>>(new Map());
  const [filterEditorIndex, setFilterEditorIndex] = useState<number | null>(null);
  const [cropEditorIndex, setCropEditorIndex] = useState<number | null>(null);
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
        toast.error(`Audio must be ${MAX_DURATION} seconds or less`);
        URL.revokeObjectURL(audioEl.src);
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
          className="mt-2 flex flex-wrap gap-2"
        >
          {media.map((m, index) => (
            <div 
              key={index} 
              className={`relative rounded-2xl overflow-hidden bg-zinc-900 ${
                media.length === 1 ? 'w-full max-w-[min(100%,320px)] sm:max-w-[min(100%,400px)]' : 'w-[calc(50%-0.25rem)] max-w-[200px]'
              }`}
            >
              {m.type === 'image' ? (
                <div className="relative">
                  <img 
                    src={m.preview} 
                    alt="" 
                    className="w-full h-auto max-h-[40vh] sm:max-h-[50vh] object-contain rounded-2xl" 
                    style={{ 
                      filter: m.filterSettings ? generateFilterCSS(m.filterSettings) : undefined,
                      transform: generateCropTransform(m.cropSettings),
                    }}
                  />
                  
                  {/* Top row: Filter + Crop buttons */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    {/* Filter button - liquid glass style */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setFilterEditorIndex(index)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
                            ${hasFilterApplied(m.filterSettings)
                              ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-[0_8px_32px_rgba(6,182,212,0.3)]' 
                              : 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_8px_32px_rgba(6,182,212,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] hover:border-cyan-400/30'
                            }`}
                        >
                          <Sparkles className="w-3 h-3 text-white" />
                          {hasFilterApplied(m.filterSettings) ? 'Filtered' : 'Filter'}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Edit filters</TooltipContent>
                    </Tooltip>
                    
                    {/* Crop button - liquid glass style */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setCropEditorIndex(index)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
                            ${hasCropApplied(m.cropSettings)
                              ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-[0_8px_32px_rgba(6,182,212,0.3)]' 
                              : 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_8px_32px_rgba(168,85,247,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] hover:border-purple-400/30'
                            }`}
                        >
                          <Crop className="w-3 h-3 text-white" />
                          {hasCropApplied(m.cropSettings) ? 'Edited' : 'Crop'}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Crop & rotate</TooltipContent>
                    </Tooltip>
                  </div>
                  
                  {/* Audio controls for images */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                    {recordingIndex === index ? (
                      // Recording in progress
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 bg-red-500 px-3 py-1.5 rounded-full text-white text-xs font-medium animate-pulse"
                      >
                        <Square className="w-3 h-3 fill-white" />
                        {recordingTime}s / {MAX_DURATION}s
                      </button>
                    ) : m.audio ? (
                      // Audio attached - show playback controls
                      <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-full">
                        <button
                          onClick={() => playingIndex === index ? stopAudio() : playAudio(m.audio!.url, index)}
                          className="w-6 h-6 flex items-center justify-center text-white"
                        >
                          {playingIndex === index ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                        <span className="text-white text-xs">{m.audio.duration}s</span>
                        <button
                          onClick={() => onRemoveAudio(index)}
                          className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : showAudioOptions === index ? (
                      // Show upload/record options with liquid glass effect
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => triggerAudioUpload(index)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
                            bg-gradient-to-br from-white/20 via-white/10 to-white/5
                            backdrop-blur-xl border border-white/20
                            shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]
                            hover:shadow-[0_8px_32px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.3)]
                            hover:border-blue-400/40 hover:from-blue-500/20 hover:via-blue-400/10 hover:to-transparent"
                        >
                          <Upload className="w-3 h-3" />
                          Upload
                        </button>
                        <button
                          onClick={() => handleStartRecording(index)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
                            bg-gradient-to-br from-white/20 via-white/10 to-white/5
                            backdrop-blur-xl border border-white/20
                            shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]
                            hover:shadow-[0_8px_32px_rgba(239,68,68,0.3),inset_0_1px_0_rgba(255,255,255,0.3)]
                            hover:border-red-400/40 hover:from-red-500/20 hover:via-red-400/10 hover:to-transparent"
                        >
                          <Mic className="w-3 h-3 text-white" />
                          Record
                        </button>
                        <button
                          onClick={() => setShowAudioOptions(null)}
                          className="flex items-center justify-center w-7 h-7 rounded-full text-white transition-all duration-300 hover:scale-105
                            bg-gradient-to-br from-white/20 via-white/10 to-white/5
                            backdrop-blur-xl border border-white/20
                            shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]
                            hover:border-white/40"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      // No audio - show add audio button with liquid glass effect
                      <button
                        onClick={() => setShowAudioOptions(index)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-all duration-300 hover:scale-105
                          bg-gradient-to-br from-white/20 via-white/10 to-white/5
                          backdrop-blur-xl border border-white/20
                          shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]
                          hover:shadow-[0_8px_32px_rgba(239,68,68,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]
                          hover:border-red-400/30"
                      >
                        <Mic className="w-3 h-3 text-white" />
                        Add audio
                      </button>
                    )}
                  </div>
                </div>
              ) : m.type === 'audio' ? (
                // Standalone audio post preview with visualizer
                <div className="relative">
                  {/* Visualizer background */}
                  <AudioVisualizer
                    audioUrl={m.preview}
                    isPlaying={playingIndex === index}
                    onPlayPause={() => {
                      if (playingIndex === index) {
                        setPlayingIndex(null);
                      } else {
                        setPlayingIndex(index);
                      }
                    }}
                    className="w-full h-40"
                    showStylePicker={true}
                  />
                  
                  {/* Track info overlay */}
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
                </div>
              ) : (
                <div className="relative">
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
                  
                  {/* Show thumbnail if set, otherwise show video */}
                  {m.thumbnail ? (
                    <div className="relative">
                      <img src={m.thumbnail} alt="Video thumbnail" className="w-full h-auto max-h-80 object-cover rounded-2xl" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                      {/* Remove thumbnail button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onRemoveThumbnail?.(index)}
                            className="absolute top-2 left-2 p-1.5 bg-black/70 hover:bg-red-500/80 rounded-full transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Remove thumbnail</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    <div className="relative">
                      <video 
                        ref={(el) => {
                          if (el) videoRefs.current.set(index, el);
                        }}
                        src={m.preview} 
                        className="w-full h-auto max-h-80 object-cover rounded-2xl"
                        onClick={() => {
                          const video = videoRefs.current.get(index);
                          if (!video || processingVideos.has(index)) return;
                          
                          if (playingVideoIndex === index) {
                            video.pause();
                            setPlayingVideoIndex(null);
                          } else {
                            // Pause any other playing video
                            videoRefs.current.forEach((v, i) => {
                              if (i !== index) v.pause();
                            });
                            video.play();
                            setPlayingVideoIndex(index);
                          }
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
                          onClick={() => {
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
                          className="absolute inset-0 flex items-center justify-center group"
                        >
                          <div className={`w-12 h-12 rounded-full bg-black/60 flex items-center justify-center transition-opacity ${
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
                    </div>
                  )}
                  {m.duration && (
                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white pointer-events-none">
                      {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                      {m.duration < 90 && <span className="ml-1 text-emerald-400">• Short</span>}
                    </div>
                  )}
                  {/* Video action buttons */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    {/* Thumbnail button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => triggerThumbnailUpload(index)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all
                            ${m.thumbnail 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-black/70 text-zinc-300 hover:bg-black/90'
                            }`}
                        >
                          <ImageIcon className="w-3 h-3 text-white" />
                          {m.thumbnail ? 'Thumbnail' : 'Thumbnail'}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Add custom thumbnail</TooltipContent>
                    </Tooltip>
                    {/* Music Video Toggle */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onToggleMusicVideo?.(index)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all
                            ${m.isMusicVideo 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-black/70 text-zinc-300 hover:bg-black/90'
                            }`}
                        >
                          <Music className="w-3 h-3 text-white" />
                          {m.isMusicVideo ? 'Music Video' : 'Music?'}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Mark as music video</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
              <button
                onClick={() => onRemove(index)}
                className="absolute top-2 right-2 p-1 bg-black/70 hover:bg-black rounded-full transition-colors"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Filter Editor Modal */}
      {filterEditorIndex !== null && media[filterEditorIndex]?.type === 'image' && (
        <FilterEditor
          isOpen={true}
          onClose={() => setFilterEditorIndex(null)}
          imageUrl={media[filterEditorIndex].preview}
          initialSettings={media[filterEditorIndex].filterSettings}
          initialPresetId={media[filterEditorIndex].filterPresetId}
          onApply={(settings, presetId) => {
            onApplyFilter?.(filterEditorIndex, settings, presetId);
            setFilterEditorIndex(null);
          }}
        />
      )}

      {/* Crop/Rotate Editor Modal */}
      {cropEditorIndex !== null && media[cropEditorIndex]?.type === 'image' && (
        <CropRotateEditor
          isOpen={true}
          onClose={() => setCropEditorIndex(null)}
          imageUrl={media[cropEditorIndex].preview}
          initialSettings={media[cropEditorIndex].cropSettings}
          onApply={(settings) => {
            onApplyCrop?.(cropEditorIndex, settings);
            setCropEditorIndex(null);
          }}
        />
      )}
    </>
  );
}
