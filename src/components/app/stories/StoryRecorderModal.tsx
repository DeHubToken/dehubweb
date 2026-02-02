/**
 * Story Recorder Modal
 * ====================
 * Full-screen camera interface for recording 30-second stories.
 * Supports both mobile and desktop cameras with front/back switching on mobile.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RotateCcw, Square, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StoryRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryRecorded: (videoBlob: Blob) => void;
}

const MAX_DURATION = 30; // seconds

export function StoryRecorderModal({ isOpen, onClose, onStoryRecorded }: StoryRecorderModalProps) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
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
    setRecordedBlob(null);
    setRecordingTime(0);
    initCamera();
  };

  const confirmStory = () => {
    if (recordedBlob) {
      onStoryRecorded(recordedBlob);
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
    setRecordedBlob(null);
    setRecordingTime(0);
    setIsRecording(false);
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
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
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
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center disabled:opacity-50"
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
        ) : (
          <video
            ref={previewRef}
            src={URL.createObjectURL(recordedBlob)}
            autoPlay
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-center gap-8">
          {!recordedBlob ? (
            // Recording controls
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isInitializing}
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center transition-all',
                isRecording
                  ? 'bg-red-500'
                  : 'bg-white/20 border-4 border-white'
              )}
            >
              {isRecording ? (
                <Square className="w-8 h-8 text-white fill-white" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-red-500" />
              )}
            </button>
          ) : (
            // Preview controls
            <>
              <button
                onClick={retake}
                className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
              >
                <RotateCcw className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={confirmStory}
                className="w-20 h-20 rounded-full bg-white flex items-center justify-center"
              >
                <Check className="w-8 h-8 text-black" />
              </button>
            </>
          )}
        </div>
        
        {!recordedBlob && !isRecording && (
          <p className="text-center text-white/60 text-sm mt-4">
            Tap to record up to 30 seconds
          </p>
        )}
      </div>
    </div>
  );
}
