import { useTranslation as _useCopy } from 'react-i18next';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { createVoiceRecorder, voiceRecordingBlob, VOICE_RECORDING_SECONDS } from '@/lib/voice-recording';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  disabled?: boolean;
  maxDuration?: number;
}

export function VoiceRecorder({ onRecordingComplete, disabled, maxDuration = VOICE_RECORDING_SECONDS }: VoiceRecorderProps) {
  const { t: _copy } = _useCopy();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);
  const completeRef = useRef(onRecordingComplete);
  completeRef.current = onRecordingComplete;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
        recorder.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (startingRef.current || mediaRecorderRef.current?.state === 'recording') return;
    startingRef.current = true;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mediaRecorder = createVoiceRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const duration = (Date.now() - startTimeRef.current) / 1000;
        const blob = voiceRecordingBlob(chunksRef.current, mediaRecorder.mimeType);
        
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
        
        if (blob.size > 0 && duration > 0.5 && mountedRef.current) {
          completeRef.current(blob, Math.round(duration * 10) / 10);
        }
        
        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        setRecordingDuration(0);
        setIsRecording(false);
      };

      mediaRecorder.onerror = () => {
        mediaRecorder.onstop = null;
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        if (mountedRef.current) {
          setIsRecording(false);
          toast.error(_copy("copy.a754a5c36acf", { defaultValue: "Could not access microphone" }));
        }
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      
      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setRecordingDuration(Math.floor(elapsed));
        if (elapsed >= maxDuration && mediaRecorder.state === 'recording') mediaRecorder.stop();
      }, 100);
      
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      console.error('Error accessing microphone:', error);
      toast.error(_copy("copy.a754a5c36acf", { defaultValue: "Could not access microphone" }));
    } finally {
      startingRef.current = false;
    }
  }, [maxDuration, _copy]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-medium tabular-nums">
            {formatDuration(recordingDuration)}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
          onClick={stopRecording}
        >
          <Square className="w-4 h-4 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
      onClick={startRecording}
      disabled={disabled}
    >
      <Mic className="w-5 h-5" />
    </Button>
  );
}
