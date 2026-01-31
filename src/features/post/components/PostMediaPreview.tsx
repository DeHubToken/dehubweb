import { useState, useRef, useEffect } from 'react';
import { X, Mic, Square, Trash2, Play, Pause, Upload, Music, ImageIcon, Loader2, Paintbrush, Crop, Scissors } from 'lucide-react';
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
              <div 
                key={index} 
                className={`relative rounded-2xl overflow-hidden bg-zinc-900 flex-shrink-0 snap-center ${
                  m.type === 'video' ? 'aspect-video w-full sm:w-[356px] md:w-[426px]' : 
                  m.type === 'audio' ? 'w-full sm:w-[320px] md:w-[360px]' :
                  'h-[160px] sm:h-[200px] md:h-[240px]'
                }`}
              >
                {m.type === 'image' ? (
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
                    {/* Filter button - consistent style */}
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
                    
                    {/* Crop button - consistent style */}
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
                    
                    {/* Audio controls */}
                    {recordingIndex === index ? (
                      // Recording in progress
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); stopRecording(); }}
                        className="flex items-center gap-2 bg-red-500 px-3 py-1.5 rounded-xl text-white text-xs font-medium animate-pulse"
                      >
                        <Square className="w-3 h-3 fill-white" />
                        {recordingTime}s / {MAX_DURATION}s
                      </button>
                    ) : m.audio ? (
                      // Audio attached - show playback controls
                      <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-xl" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); playingIndex === index ? stopAudio() : playAudio(m.audio!.url, index); }}
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
                          onClick={(e) => { e.stopPropagation(); onRemoveAudio(index); }}
                          className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : showAudioOptions === index ? (
                      // Show upload/record options with liquid glass effect
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
                </div>
              ) : m.type === 'audio' ? (
                // Standalone audio post preview with visualizer - matching image container style
                <div className="relative h-full flex items-center justify-center">
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
                    className="h-full w-auto min-w-[200px] aspect-[2/1]"
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
                <div className="relative w-full h-full">
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
                    <div className="relative w-full h-full">
                      <img 
                        src={m.thumbnail} 
                        alt="Video thumbnail" 
                        className="w-full h-full object-cover rounded-2xl"
                        style={{ 
                          filter: m.filterSettings ? generateFilterCSS(m.filterSettings) : undefined,
                          transform: generateCropTransform(m.cropSettings),
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-xl bg-black/60 flex items-center justify-center">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                      {/* Remove thumbnail button */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onRemoveThumbnail?.(index)}
                            className="absolute top-2 left-2 p-1.5 bg-black/70 hover:bg-red-500/80 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Remove thumbnail</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
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
                      {/* Play/Pause overlay - double click for fullscreen */}
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
                            // Pause the thumbnail video
                            if (video) {
                              video.pause();
                            }
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
                    </div>
                  )}
                  
                  {/* Top left: Filter + Crop + Trim buttons - liquid glass style */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                    {/* Filter button */}
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
                    
                    {/* Crop button */}
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
                    
                    {/* Trim button */}
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
                  
                  {m.duration && (
                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white pointer-events-none">
                      {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                      {m.duration < 90 && <span className="ml-1 text-emerald-400">• Short</span>}
                    </div>
                  )}
                  
                  {/* Video action buttons - liquid glass style */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    {/* Thumbnail button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); triggerThumbnailUpload(index); }}
                          className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-300 hover:scale-105
                            ${m.thumbnail 
                              ? 'bg-black/70 text-white backdrop-blur-xl border border-white/40' 
                              : 'bg-black/60 backdrop-blur-xl border border-white/20 text-white hover:bg-black/70 hover:border-white/40'
                            }`}
                        >
                          <ImageIcon className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Add custom thumbnail</TooltipContent>
                    </Tooltip>
                    
                    {/* Music Video Toggle */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onToggleMusicVideo?.(index); }}
                          className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-300 hover:scale-105
                            ${m.isMusicVideo 
                              ? 'bg-emerald-500/40 text-white backdrop-blur-xl border border-emerald-400/40' 
                              : 'bg-black/60 backdrop-blur-xl border border-white/20 text-white hover:bg-black/70 hover:border-white/40'
                            }`}
                        >
                          <Music className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Mark as music video</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
              <button
                onClick={() => onRemove(index)}
                className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
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
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm">
              {fullscreenPreview.index + 1} / {media.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
