/**
 * Story Recorder Modal
 * ====================
 * Full-screen camera interface for recording 30-second stories.
 * Supports both mobile and desktop cameras with front/back switching on mobile.
 * Includes overlay editor for emoji stickers and text overlays.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, Trash2, Square, Check, Loader2, RotateCcw, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { StoryOverlayEditor } from './StoryOverlayEditor';
import { StoryOverlay } from './types';

interface StoryRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryRecorded: (videoBlob: Blob, overlays?: StoryOverlay[]) => void;
  onPhotoCaptured?: (imageBlob: Blob) => void;
}

const MAX_DURATION = 30; // seconds

export function StoryRecorderModal({ isOpen, onClose, onStoryRecorded, onPhotoCaptured }: StoryRecorderModalProps) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check for multiple cameras
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoInputs.length > 1);
    });
  }, []);

  // Initialize camera
  const initCamera = useCallback(async () => {
    setIsInitializing(true);
    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera access error:', error);
      toast.error('Could not access camera. Please check permissions.');
      onClose();
    } finally {
      setIsInitializing(false);
    }
  }, [facingMode, onClose]);

  useEffect(() => {
    if (isOpen && !recordedBlob) {
      initCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isOpen, initCamera, recordedBlob]);

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Flip horizontally if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        if (onPhotoCaptured) {
          onPhotoCaptured(blob);
          handleClose();
        } else {
          // Fallback: download the image
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `story-photo-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Photo captured!');
        }
      }
    }, 'image/png');
  }, [facingMode, onPhotoCaptured]);

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      // Create stable URL for preview
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      
      // Stop camera stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000); // Collect data every second
    setIsRecording(true);
    setRecordingTime(0);

    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= MAX_DURATION - 1) {
          stopRecording();
          return MAX_DURATION;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
  };

  const retake = () => {
    // Revoke old URL to prevent memory leak
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setRecordedBlob(null);
    setRecordingTime(0);
    setIsPreviewPlaying(false);
    setOverlays([]); // Clear overlays on retake
    initCamera();
  };

  const confirmStory = () => {
    if (recordedBlob) {
      onStoryRecorded(recordedBlob, overlays.length > 0 ? overlays : undefined);
      handleClose();
    }
  };

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    // Revoke URL to prevent memory leak
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setRecordedBlob(null);
    setRecordingTime(0);
    setIsRecording(false);
    setIsPreviewPlaying(false);
    setOverlays([]); // Clear overlays on close
    onClose();
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        
        {/* Timer */}
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          )}
          <span className="text-white font-mono text-lg">
            {formatTime(recordingTime)} / {formatTime(MAX_DURATION)}
          </span>
        </div>

        {/* Flip camera button */}
        {hasMultipleCameras && !recordedBlob && (
          <button
            onClick={flipCamera}
            disabled={isRecording}
            className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center disabled:opacity-50"
          >
            <RotateCcw className="w-5 h-5 text-white" />
          </button>
        )}
        {!hasMultipleCameras && <div className="w-10" />}
      </div>

      {/* Progress bar */}
      {isRecording && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 z-20">
          <div
            className="h-full bg-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${(recordingTime / MAX_DURATION) * 100}%` }}
          />
        </div>
      )}

      {/* Video preview */}
      <div className="flex-1 relative">
        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
        
        {!recordedBlob ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              'w-full h-full object-cover',
              facingMode === 'user' && 'scale-x-[-1]'
            )}
          />
        ) : previewUrl ? (
          <div ref={previewContainerRef} className="relative w-full h-full">
            <video
              ref={previewRef}
              src={previewUrl}
              loop
              playsInline
              className="w-full h-full object-cover"
              onPlay={() => setIsPreviewPlaying(true)}
              onPause={() => setIsPreviewPlaying(false)}
              onEnded={() => setIsPreviewPlaying(false)}
            />
            
            {/* Overlay Editor - for adding emoji and text */}
            <StoryOverlayEditor
              overlays={overlays}
              onOverlaysChange={setOverlays}
              containerRef={previewContainerRef}
            />
            
            {/* Play button overlay - positioned to account for bottom controls */}
            {!isPreviewPlaying && (
              <button
                onClick={() => {
                  if (previewRef.current) {
                    previewRef.current.play().catch(console.error);
                  }
                }}
                className="absolute inset-0 bottom-32 flex items-center justify-center z-5 pointer-events-auto"
              >
                <div className="w-20 h-20 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center">
                  <Play className="w-10 h-10 text-white fill-white ml-1" />
                </div>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-center gap-6">
          {!recordedBlob ? (
            // Recording controls - record and capture buttons
            <div className="flex items-center gap-4">
              {/* Capture photo button */}
              <button
                onClick={capturePhoto}
                disabled={isInitializing || isRecording}
                className={cn(
                  'w-16 h-16 rounded-xl flex items-center justify-center transition-all',
                  'bg-white/10 backdrop-blur-[24px] saturate-[180%] border border-white/20',
                  'hover:bg-white/20 disabled:opacity-50'
                )}
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
              
              {/* Record video button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isInitializing}
                className={cn(
                  'w-16 h-16 rounded-xl flex items-center justify-center transition-all',
                  'bg-white/10 backdrop-blur-[24px] saturate-[180%] border border-white/20',
                  'hover:bg-white/20 disabled:opacity-50',
                  isRecording && 'bg-red-500/20 border-red-500/40'
                )}
              >
                {isRecording ? (
                  <Square className="w-6 h-6 text-white fill-white" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-red-500" />
                )}
              </button>
            </div>
          ) : (
            // Preview controls - wide buttons filling screen on mobile
            <div className="flex items-center gap-4 w-full">
              <button
                onClick={retake}
                className="flex-1 h-14 rounded-xl bg-red-500/20 backdrop-blur-[24px] saturate-[180%] border border-red-500/40 flex items-center justify-center gap-2 hover:bg-red-500/30 transition-all"
              >
                <Trash2 className="w-5 h-5 text-red-400" />
                <span className="text-red-400 font-medium">Delete</span>
              </button>
              <button
                onClick={confirmStory}
                className="flex-1 h-14 rounded-xl bg-white/10 backdrop-blur-[24px] saturate-[180%] border border-white/20 flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
              >
                <Check className="w-5 h-5 text-white" />
                <span className="text-white font-medium">Confirm</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
