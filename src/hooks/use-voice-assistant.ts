/**
 * Voice Assistant Hook
 * ====================
 * Continuous voice conversation using Whisper STT + Dia TTS via fal.ai.
 * Records audio → uploads to storage → Whisper transcribes → AI responds → Dia speaks.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseVoiceAssistantOptions {
  /** Called when Whisper returns a transcript */
  onTranscript: (text: string) => void;
  /** Called when TTS audio is ready and playing */
  onSpeakStart?: () => void;
  /** Called when TTS audio finishes playing */
  onSpeakEnd?: () => void;
  /** Called with status updates */
  onStatusChange?: (status: VoiceStatus) => void;
  /** Whether the chat is currently processing */
  isChatLoading?: boolean;
}

export type VoiceStatus = 
  | 'idle'           // Not in voice mode
  | 'listening'      // Recording user audio
  | 'transcribing'   // Sending to Whisper
  | 'thinking'       // Waiting for AI response
  | 'speaking'       // Playing TTS audio
  | 'error';

interface UseVoiceAssistantReturn {
  /** Whether voice mode is active (continuous loop) */
  isVoiceMode: boolean;
  /** Current status within the voice loop */
  status: VoiceStatus;
  /** Start continuous voice mode */
  startVoiceMode: () => Promise<void>;
  /** Stop voice mode entirely */
  stopVoiceMode: () => void;
  /** Speak text using Dia TTS, returns when done */
  speakResponse: (text: string) => Promise<void>;
  /** Stop current speech playback */
  stopSpeaking: () => void;
  /** Whether TTS is currently playing */
  isSpeaking: boolean;
  /** Current recording duration in seconds */
  recordingDuration: number;
}

export function useVoiceAssistant(options: UseVoiceAssistantOptions): UseVoiceAssistantReturn {
  const { onTranscript, onSpeakStart, onSpeakEnd, onStatusChange, isChatLoading } = options;

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);
  const voiceModeRef = useRef(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync
  const onTranscriptRef = useRef(onTranscript);
  const onSpeakStartRef = useRef(onSpeakStart);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onSpeakStartRef.current = onSpeakStart;
    onSpeakEndRef.current = onSpeakEnd;
    onStatusChangeRef.current = onStatusChange;
  }, [onTranscript, onSpeakStart, onSpeakEnd, onStatusChange]);

  const updateStatus = useCallback((s: VoiceStatus) => {
    setStatus(s);
    onStatusChangeRef.current?.(s);
  }, []);

  // Upload audio blob to Supabase storage and return a public URL
  const uploadAudio = useCallback(async (blob: Blob): Promise<string> => {
    const fileName = `voice-${Date.now()}.webm`;
    const filePath = `voice-assistant/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, blob, {
        contentType: 'audio/webm',
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }, []);

  // Transcribe audio via Whisper (fal-ai-tools)
  const transcribeAudio = useCallback(async (audioUrl: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('fal-ai-tools', {
      body: { tool: 'whisper', audio_url: audioUrl },
    });

    if (error) throw error;
    if (data.error) throw new Error(data.error);

    return data.text || '';
  }, []);

  // Generate speech via Dia TTS (fal-ai-tools)
  const generateSpeech = useCallback(async (text: string): Promise<string> => {
    // Clean text for TTS
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, '. ')
      .trim();

    if (!cleanText) throw new Error('No text to speak');

    // Truncate for TTS (Dia has limits)
    const truncated = cleanText.substring(0, 1500);

    const { data, error } = await supabase.functions.invoke('fal-ai-tools', {
      body: { tool: 'dia-tts', text: truncated },
    });

    if (error) throw error;
    if (data.error) throw new Error(data.error);

    return data.audioUrl;
  }, []);

  // Play audio URL and return a promise that resolves when done
  const playAudio = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsSpeaking(true);
        onSpeakStartRef.current?.();
      };

      audio.onended = () => {
        setIsSpeaking(false);
        onSpeakEndRef.current?.();
        audioRef.current = null;
        resolve();
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch(reject);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Start recording with silence detection
  const startListening = useCallback(async () => {
    if (!voiceModeRef.current) return;

    updateStatus('listening');
    setRecordingDuration(0);
    chunksRef.current = [];
    startTimeRef.current = Date.now();

    try {
      // Reuse existing stream or create new one
      if (!streamRef.current || streamRef.current.getTracks().some(t => t.readyState === 'ended')) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }

      const stream = streamRef.current;

      // Set up audio analyser for silence detection
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(250);

      // Duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Silence detection: stop after 2s of silence
      let silentFrames = 0;
      const SILENCE_THRESHOLD = 15; // amplitude threshold
      const SILENCE_FRAMES_NEEDED = 16; // ~2s at 8 checks/s
      const MIN_RECORDING_MS = 1000; // minimum 1s recording

      silenceCheckRef.current = setInterval(() => {
        if (!analyserRef.current || !voiceModeRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg < SILENCE_THRESHOLD) {
          silentFrames++;
        } else {
          silentFrames = 0;
        }

        const elapsed = Date.now() - startTimeRef.current;
        if (silentFrames >= SILENCE_FRAMES_NEEDED && elapsed > MIN_RECORDING_MS) {
          // Silence detected — stop recording and process
          stopListeningAndProcess();
        }
      }, 125);

      // Auto-stop after 30s max
      silenceTimerRef.current = setTimeout(() => {
        if (voiceModeRef.current && mediaRecorderRef.current?.state === 'recording') {
          stopListeningAndProcess();
        }
      }, 30000);

    } catch (err) {
      console.error('[VoiceAssistant] Mic error:', err);
      toast.error('Could not access microphone');
      updateStatus('error');
    }
  }, [updateStatus]);

  const stopListeningAndProcess = useCallback(async () => {
    // Clear timers
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (silenceCheckRef.current) { clearInterval(silenceCheckRef.current); silenceCheckRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

        if (blob.size < 1000 || duration < 1) {
          // Too short — restart listening
          if (voiceModeRef.current) {
            startListening();
          }
          resolve();
          return;
        }

        // Process the audio
        updateStatus('transcribing');
        try {
          const audioUrl = await uploadAudio(blob);
          const transcript = await transcribeAudio(audioUrl);

          if (transcript.trim()) {
            // Send transcript to chat
            onTranscriptRef.current(transcript.trim());
            updateStatus('thinking');
          } else {
            // Empty transcript — restart listening
            if (voiceModeRef.current) {
              startListening();
            }
          }
        } catch (err) {
          console.error('[VoiceAssistant] Transcription error:', err);
          toast.error('Transcription failed');
          if (voiceModeRef.current) {
            startListening();
          }
        }
        resolve();
      };

      recorder.stop();
    });
  }, [uploadAudio, transcribeAudio, updateStatus, startListening]);

  // Speak response and then restart listening
  const speakResponse = useCallback(async (text: string) => {
    if (!voiceModeRef.current) return;

    updateStatus('speaking');
    try {
      const audioUrl = await generateSpeech(text);
      await playAudio(audioUrl);
    } catch (err) {
      console.error('[VoiceAssistant] TTS error:', err);
      // Don't toast — just continue
    }

    // After speaking (or error), restart listening if still in voice mode
    if (voiceModeRef.current) {
      startListening();
    }
  }, [generateSpeech, playAudio, updateStatus, startListening]);

  // Start voice mode
  const startVoiceMode = useCallback(async () => {
    try {
      // Request mic permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      voiceModeRef.current = true;
      setIsVoiceMode(true);
      toast.success('Voice mode activated — each exchange uses Whisper + Dia TTS (DHB charged per use)');

      startListening();
    } catch (err) {
      console.error('[VoiceAssistant] Permission denied:', err);
      toast.error('Microphone access required for voice mode');
    }
  }, [startListening]);

  // Stop voice mode
  const stopVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    setIsVoiceMode(false);
    updateStatus('idle');
    setRecordingDuration(0);

    // Clean up everything
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (silenceCheckRef.current) { clearInterval(silenceCheckRef.current); silenceCheckRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    stopSpeaking();
  }, [updateStatus, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return {
    isVoiceMode,
    status,
    startVoiceMode,
    stopVoiceMode,
    speakResponse,
    stopSpeaking,
    isSpeaking,
    recordingDuration,
  };
}
