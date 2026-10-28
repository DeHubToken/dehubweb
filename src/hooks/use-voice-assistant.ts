import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Voice Assistant Hook
 * ====================
 * Continuous voice conversation using Whisper STT + Dia TTS via fal.ai.
 * Records audio → uploads to storage → Whisper transcribes → AI responds → Dia speaks.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAi, isPaymentRequired } from '@/lib/ai-invoke';
import { payForVoiceSession, VOICE_EXCHANGE_DHB, VOICE_SESSION_EXCHANGES } from '@/lib/ai-payment';
import { toast } from 'sonner';
import i18n from 'i18next';
import { createVoiceRecorder, voiceRecordingBlob, voiceRecordingFilename } from '@/lib/voice-recording';

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
  /** Called when the server refuses the charge, so voice mode can stop. */
  onPaymentRequired?: () => void;
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
  /** Exchanges left on the prepaid session, or undefined before one is bought. */
  exchangesLeft?: number;
  /**
   * Loudness right now, 0–1: the mic while listening, the reply while it
   * plays. Read it every animation frame; it never re-renders.
   */
  getLevel: () => number;
  /** Ends the current turn now and sends what was said, as a tap on the ball. */
  finishTurn: () => Promise<void>;
}

export function useVoiceAssistant(options: UseVoiceAssistantOptions): UseVoiceAssistantReturn {
  const { t: _copy } = _useCopy();
  const { onTranscript, onSpeakStart, onSpeakEnd, onStatusChange, isChatLoading, onPaymentRequired } = options;

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // The transfer that paid for this session. Every exchange carries it, and
  // the backend counts them down against what it is worth.
  const sessionTxRef = useRef<string>('');
  const [exchangesLeft, setExchangesLeft] = useState<number | undefined>(undefined);
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
  const statusRef = useRef<VoiceStatus>('idle');
  // Taps the reply's audio so the orb can move with the voice. Null when the
  // clip could not be routed through the page's AudioContext.
  const replyAnalyserRef = useRef<AnalyserNode | null>(null);
  const replyObjectUrlRef = useRef<string | null>(null);
  const levelBufRef = useRef<Uint8Array | null>(null);

  // Keep refs in sync
  const onTranscriptRef = useRef(onTranscript);
  const onPaymentRequiredRef = useRef(onPaymentRequired);
  const onSpeakStartRef = useRef(onSpeakStart);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onPaymentRequiredRef.current = onPaymentRequired;
    onSpeakStartRef.current = onSpeakStart;
    onSpeakEndRef.current = onSpeakEnd;
    onStatusChangeRef.current = onStatusChange;
  }, [onTranscript, onPaymentRequired, onSpeakStart, onSpeakEnd, onStatusChange]);

  const updateStatus = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
    onStatusChangeRef.current?.(s);
  }, []);

  // Upload audio blob to Supabase storage and return a public URL
  const uploadAudio = useCallback(async (blob: Blob): Promise<string> => {
    const fileName = voiceRecordingFilename(blob.type);
    const filePath = `voice-assistant/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, blob, {
        contentType: blob.type,
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
    const { data, error } = await invokeAi('fal-ai-tools', {
      body: { tool: 'whisper', audio_url: audioUrl, txHash: sessionTxRef.current, purpose: 'voice' },
    });

    if (error) throw error;
    if (data.error) throw new Error(data.error);

    // One exchange drawn from the session. The server is the authority on
    // what is left; this is the display counting alongside it.
    setExchangesLeft((left) => (left === undefined ? left : Math.max(0, left - 1)));

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

    const { data, error } = await invokeAi('fal-ai-tools', {
      body: { tool: 'dia-tts', text: truncated, txHash: sessionTxRef.current, purpose: 'voice' },
    });

    if (error) throw error;
    if (data.error) throw new Error(data.error);

    return data.audioUrl;
  }, []);

  const releaseReplyAudio = useCallback(() => {
    replyAnalyserRef.current = null;
    if (replyObjectUrlRef.current) {
      URL.revokeObjectURL(replyObjectUrlRef.current);
      replyObjectUrlRef.current = null;
    }
  }, []);

  // Play audio URL and return a promise that resolves when done
  const playAudio = useCallback(async (url: string): Promise<void> => {
    // Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    releaseReplyAudio();

    // A same-origin copy of the clip can be measured; a cross-origin one routed
    // through Web Audio would play as silence. If the copy fails, the clip
    // plays straight from its URL and the orb falls back to a speech rhythm.
    let src = url;
    try {
      const res = await fetch(url);
      if (res.ok) {
        src = URL.createObjectURL(await res.blob());
        replyObjectUrlRef.current = src;
      }
    } catch {
      // Keep the original URL.
    }

    return new Promise((resolve, reject) => {
      const audio = new Audio(src);
      audioRef.current = audio;

      const ctx = audioContextRef.current;
      if (replyObjectUrlRef.current && ctx && ctx.state === 'running') {
        try {
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          replyAnalyserRef.current = analyser;
        } catch {
          replyAnalyserRef.current = null;
        }
      }

      audio.onplay = () => {
        setIsSpeaking(true);
        onSpeakStartRef.current?.();
      };

      audio.onended = () => {
        setIsSpeaking(false);
        onSpeakEndRef.current?.();
        audioRef.current = null;
        releaseReplyAudio();
        resolve();
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        releaseReplyAudio();
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch(reject);
    });
  }, [releaseReplyAudio]);

  const getLevel = useCallback((): number => {
    const s = statusRef.current;
    if (s === 'speaking') {
      const audio = audioRef.current;
      if (!audio || audio.paused) return 0;
      const analyser = replyAnalyserRef.current;
      if (!analyser) {
        // No tap on the clip: a syllable-like rhythm keeps the orb talking.
        const t = performance.now() / 1000;
        return 0.35 + 0.45 * Math.abs(Math.sin(t * 8.7)) * Math.abs(Math.sin(t * 2.3 + 1));
      }
      if (!levelBufRef.current || levelBufRef.current.length !== analyser.fftSize) {
        levelBufRef.current = new Uint8Array(analyser.fftSize);
      }
      const buf = levelBufRef.current;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    }
    if (s === 'listening') {
      const analyser = analyserRef.current;
      if (!analyser) return 0;
      if (!levelBufRef.current || levelBufRef.current.length !== analyser.frequencyBinCount) {
        levelBufRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      const buf = levelBufRef.current;
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      return Math.min(1, sum / buf.length / 70);
    }
    return 0;
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    releaseReplyAudio();
    setIsSpeaking(false);
  }, [releaseReplyAudio]);

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

      const mediaRecorder = createVoiceRecorder(stream);

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
      toast.error(_copy("copy.a754a5c36acf", { defaultValue: "Could not access microphone" }));
      updateStatus('error');
    }
  }, [updateStatus, _copy]);

  const stopListeningAndProcess = useCallback(async () => {
    // Clear timers
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (silenceCheckRef.current) { clearInterval(silenceCheckRef.current); silenceCheckRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = voiceRecordingBlob(chunksRef.current, recorder.mimeType);
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
          // Running out of the prepaid session is not a transcription failure, and
          // restarting the mic would only burn another round trip into the
          // same refusal. Hand it up so the caller can stop and say why.
          if (isPaymentRequired(err)) {
            onPaymentRequiredRef.current?.();
            resolve();
            return;
          }
          toast.error(_copy("copy.ccb684944295", { defaultValue: "Transcription failed" }));
          if (voiceModeRef.current) {
            startListening();
          }
        }
        resolve();
      };

      recorder.stop();
    });
  }, [uploadAudio, transcribeAudio, updateStatus, startListening, _copy]);

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
    let stream: MediaStream;
    try {
      // Request mic permission first — asking someone to pay for a session
      // they then cannot use would be the wrong order.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('[VoiceAssistant] Permission denied:', err);
      toast.error(_copy("copy.3dd8c4dd8ee7", { defaultValue: "Microphone access required for voice mode" }));
      return;
    }

    // Voice is billed per exchange and cannot ask for a signature between
    // sentences, so the session is paid for once up front and each exchange
    // draws from that one transfer.
    const sessionDhb = VOICE_SESSION_EXCHANGES * VOICE_EXCHANGE_DHB;
    // A session already paid for on this page is picked back up rather than
    // bought again — stopping and restarting voice mode must not cost twice.
    if (sessionTxRef.current) {
      streamRef.current = stream;
      voiceModeRef.current = true;
      setIsVoiceMode(true);
      startListening();
      return;
    }

    try {
      toast.loading(i18n.t('tokenPayments.paying', { amount: sessionDhb.toLocaleString() }), { id: 'voice-session' });
      sessionTxRef.current = await payForVoiceSession();
      setExchangesLeft(VOICE_SESSION_EXCHANGES);
      toast.success(
        _copy("copy.1a19c3a9fe4b", { defaultValue: "Voice mode activated — {{value1}} exchanges paid for.", value1: VOICE_SESSION_EXCHANGES }),
        { id: 'voice-session' },
      );
    } catch (err) {
      toast.dismiss('voice-session');
      toast.error(err instanceof Error ? err.message : _copy("copy.0cf23e6e3094", { defaultValue: "Could not pay for a voice session." }));
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    voiceModeRef.current = true;
    setIsVoiceMode(true);
    startListening();
  }, [startListening, _copy]);

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
    exchangesLeft,
    getLevel,
    finishTurn: stopListeningAndProcess,
  };
}
