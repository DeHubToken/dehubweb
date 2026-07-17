/**
 * Voice Chat Hook using Browser Web Speech API
 * ==============================================
 * Uses free browser APIs for speech recognition and text-to-speech.
 * No external API keys required!
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceChatOptions {
  onTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
  /** Voice preference for text-to-speech */
  voicePreference?: 'female' | 'male' | 'neutral';
}

interface UseVoiceChatReturn {
  isRecording: boolean;
  isSpeaking: boolean;
  transcript: string;
  startRecording: () => void;
  stopRecording: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  isSupported: boolean;
}

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// Check if Web Speech API is supported
const isSpeechRecognitionSupported = () => {
  return typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
};

const isSpeechSynthesisSupported = () => {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
};

export function useVoiceChat(options: UseVoiceChatOptions = {}): UseVoiceChatReturn {
  const { onTranscript, onError, voicePreference = 'female' } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const isSupported = isSpeechRecognitionSupported() && isSpeechSynthesisSupported();

  // Store callbacks in refs to avoid recreating recognition on callback changes
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  // Load voices on mount and listen for changes (voices load asynchronously)
  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
      }
    };
    
    // Initial load
    loadVoices();
    
    // Listen for voices to be loaded (required for Chrome).
    // iOS 15 Safari implements speechSynthesis but NOT addEventListener — fall back to onvoiceschanged.
    const synth = window.speechSynthesis as SpeechSynthesis & {
      addEventListener?: typeof window.addEventListener;
      removeEventListener?: typeof window.removeEventListener;
    };
    const hasAddEventListener = typeof synth.addEventListener === 'function';

    if (hasAddEventListener) {
      synth.addEventListener!('voiceschanged', loadVoices);
    } else {
      synth.onvoiceschanged = loadVoices;
    }

    return () => {
      if (hasAddEventListener) {
        synth.removeEventListener!('voiceschanged', loadVoices);
      } else if (synth.onvoiceschanged === loadVoices) {
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  // Create recognition instance on demand (must be triggered by user gesture on mobile)
  const createRecognition = useCallback(() => {
    if (!isSpeechRecognitionSupported()) return null;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return null;
    
    const recognition = new SpeechRecognitionAPI();
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = Array.from({ length: event.results.length }, (_, i) => event.results[i]);
      const transcriptText = results
        .map(result => result[0].transcript)
        .join('');
      
      setTranscript(transcriptText);
      
      // If final result, call callback
      if (results.length > 0 && results[results.length - 1].isFinal) {
        onTranscriptRef.current?.(transcriptText);
      }
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      
      if (event.error === 'not-allowed') {
        onErrorRef.current?.('Microphone access denied. Please enable microphone permissions.');
      } else if (event.error === 'no-speech') {
        onErrorRef.current?.('No speech detected. Try again.');
      } else if (event.error !== 'aborted') {
        onErrorRef.current?.(`Speech recognition error: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    return recognition;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      onErrorRef.current?.('Speech recognition not supported in this browser');
      return;
    }
    
    // Stop any ongoing speech
    if (isSpeaking && isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    
    // Abort previous instance if exists
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
    }
    
    // Create fresh instance (required for mobile - must be in user gesture context)
    const recognition = createRecognition();
    if (!recognition) {
      onErrorRef.current?.('Failed to initialize speech recognition');
      return;
    }
    
    recognitionRef.current = recognition;
    setTranscript('');
    setIsRecording(true);
    
    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setIsRecording(false);
      onErrorRef.current?.('Failed to start recording. Please try again.');
    }
  }, [isSpeaking, createRecognition]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const speak = useCallback((text: string) => {
    if (!isSpeechSynthesisSupported()) {
      onError?.('Text-to-speech not supported');
      return;
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    // Clean text for better speech (remove markdown, etc.)
    const cleanText = text
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '')   // Remove italic markers
      .replace(/`/g, '')    // Remove code markers
      .replace(/#{1,6}\s/g, '') // Remove heading markers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to just text
      .replace(/\n+/g, '. ') // Convert newlines to pauses
      .trim();
    
    if (!cleanText) return;
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Use cached voices for consistent selection
    const voicesToUse = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
    
    let preferredVoice: SpeechSynthesisVoice | undefined;
    
    if (voicePreference === 'female') {
      preferredVoice = 
        voicesToUse.find(v => v.name === 'Samantha') ||
        voicesToUse.find(v => v.name === 'Google UK English Female') ||
        voicesToUse.find(v => v.name === 'Google US English') ||
        voicesToUse.find(v => v.name.includes('Female') && v.lang.startsWith('en')) ||
        voicesToUse.find(v => v.name === 'Microsoft Zira - English (United States)') ||
        voicesToUse.find(v => v.lang.startsWith('en-'));
    } else if (voicePreference === 'male') {
      preferredVoice = 
        voicesToUse.find(v => v.name === 'Alex') ||
        voicesToUse.find(v => v.name === 'Daniel') ||
        voicesToUse.find(v => v.name === 'Google UK English Male') ||
        voicesToUse.find(v => v.name.includes('Male') && v.lang.startsWith('en')) ||
        voicesToUse.find(v => v.name === 'Microsoft David - English (United States)') ||
        voicesToUse.find(v => v.lang.startsWith('en-'));
    } else {
      // Neutral - just get first English voice
      preferredVoice = voicesToUse.find(v => v.lang.startsWith('en-'));
    }
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [onError, voices, voicePreference]);

  const stopSpeaking = useCallback(() => {
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  return {
    isRecording,
    isSpeaking,
    transcript,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isSupported,
  };
}
