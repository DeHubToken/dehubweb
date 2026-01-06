import { useState, useRef, useEffect } from 'react';
import { X, Mic, Square, Trash2, Play, Pause, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { MediaFile, AudioFile } from '../types';

interface PostMediaPreviewProps {
  media: MediaFile[];
  onRemove: (index: number) => void;
  onAddAudio: (index: number, audio: AudioFile) => void;
  onRemoveAudio: (index: number) => void;
}

const MAX_DURATION = 30; // 30 seconds max

export function PostMediaPreview({ media, onRemove, onAddAudio, onRemoveAudio }: PostMediaPreviewProps) {
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [showAudioOptions, setShowAudioOptions] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadIndex = useRef<number | null>(null);
  const recordingTimeRef = useRef(0);

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
      
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-2 grid gap-2"
          style={{
            gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)',
          }}
        >
          {media.map((m, index) => (
            <div key={index} className="relative rounded-xl overflow-hidden bg-zinc-900">
              {m.type === 'image' ? (
                <div className="relative">
                  <img src={m.preview} alt="" className="w-full h-32 object-cover" />
                  
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
                      // Show upload/record options
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => triggerAudioUpload(index)}
                          className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded-full text-white text-xs hover:bg-black/80 transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          Upload
                        </button>
                        <button
                          onClick={() => handleStartRecording(index)}
                          className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded-full text-white text-xs hover:bg-black/80 transition-colors"
                        >
                          <Mic className="w-3 h-3 text-red-400" />
                          Record
                        </button>
                        <button
                          onClick={() => setShowAudioOptions(null)}
                          className="flex items-center justify-center w-6 h-6 bg-black/70 backdrop-blur-sm rounded-full text-white hover:bg-black/80 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      // No audio - show add audio button
                      <button
                        onClick={() => setShowAudioOptions(index)}
                        className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-xs hover:bg-black/80 transition-colors"
                      >
                        <Mic className="w-3 h-3 text-red-400" />
                        Add audio
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <video src={m.preview} className="w-full h-32 object-cover" />
                  {m.duration && (
                    <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white">
                      {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                      {m.duration < 90 && <span className="ml-1 text-emerald-400">• Short</span>}
                    </div>
                  )}
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
    </>
  );
}
