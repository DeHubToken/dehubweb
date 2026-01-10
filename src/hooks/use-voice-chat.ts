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
  const { onTranscript, onError } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  const isSupported = isSpeechRecognitionSupported() && isSpeechSynthesisSupported();

  // Initialize speech recognition
  useEffect(() => {
    if (!isSpeechRecognitionSupported()) return;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    
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
        onTranscript?.(transcriptText);
      }
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      
      if (event.error === 'not-allowed') {
        onError?.('Microphone access denied. Please enable microphone permissions.');
      } else if (event.error === 'no-speech') {
        onError?.('No speech detected. Try again.');
      } else {
        onError?.(`Speech recognition error: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      recognition.abort();
    };
  }, [onTranscript, onError]);

  const startRecording = useCallback(() => {
    if (!recognitionRef.current) {
      onError?.('Speech recognition not supported');
      return;
    }
    
    // Stop any ongoing speech
    if (isSpeaking && isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    
    setTranscript('');
    setIsRecording(true);
    
    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setIsRecording(false);
      onError?.('Failed to start recording');
    }
  }, [isSpeaking, onError]);

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
    
    // Try to use a nice voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Google') || 
      v.name.includes('Samantha') ||
      v.name.includes('Alex') ||
      v.lang.startsWith('en')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [onError]);

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
