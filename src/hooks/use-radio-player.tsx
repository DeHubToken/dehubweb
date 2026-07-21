/**
 * Radio Player Hook
 * =================
 * Global state management for radio streaming playback.
 * Uses React Context to share audio state across components.
 * 
 * @module hooks/use-radio-player
 */

import { 
  createContext, 
  useContext, 
  useState, 
  useRef, 
  useCallback, 
  useEffect, 
  type ReactNode 
} from 'react';
import type { RadioStation } from '@/lib/api/radio-browser';
import { registerStationClick } from '@/lib/api/radio-browser';
import { toast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

interface RadioPlayerState {
  currentStation: RadioStation | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  error: string | null;
}

interface RadioPlayerContextValue extends RadioPlayerState {
  play: (station: RadioStation) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
  getAnalyser: () => AnalyserNode | null;
}

// ============================================================================
// CONTEXT
// ============================================================================

const RadioPlayerContext = createContext<RadioPlayerContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface RadioPlayerProviderProps {
  children: ReactNode;
}

export function RadioPlayerProvider({ children }: RadioPlayerProviderProps) {
  const [state, setState] = useState<RadioPlayerState>({
    currentStation: null,
    isPlaying: false,
    isLoading: false,
    volume: 0.8,
    error: null,
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const isConnectedRef = useRef(false);
  
  // Setup audio analyser (once per audio element)
  const setupAnalyser = useCallback(() => {
    if (isConnectedRef.current || !audioRef.current) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      sourceRef.current = ctx.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
      
      isConnectedRef.current = true;
    } catch (err) {
      console.error('Failed to setup audio analyser:', err);
    }
  }, []);

  // Park / un-park the Web Audio graph around idle periods. createMediaElementSource
  // routes playback through ctx.destination, so a *running* AudioContext keeps the
  // audio render thread (and the device's audio hardware) engaged even while the
  // <audio> is paused — a needless, session-long battery/heat cost on mobile once
  // radio has been played. Suspend when the user pauses/stops; resume before
  // playback so audio is never routed through a parked context (which would be
  // silent). Never close() it: a second MediaElementSource can't be attached to the
  // same element, so the graph is built once and reused via suspend/resume. Resume
  // is always called from a user-gesture stack (play/resume buttons), so iOS allows
  // it. We only suspend on explicit pause/stop — never on tab-hidden — so radio
  // keeps playing when backgrounded.
  const resumeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }, []);
  const suspendAudioContext = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }, []);

  // Get analyser for visualizer components
  const getAnalyser = useCallback(() => {
    // Setup on first request if not already done
    if (!isConnectedRef.current) {
      setupAnalyser();
    }
    return analyserRef.current;
  }, [setupAnalyser]);
  
  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;
    audioRef.current.crossOrigin = 'anonymous'; // Required for CORS audio streams
    
    const audio = audioRef.current;
    
    const handleCanPlay = () => {
      setState(prev => ({ ...prev, isLoading: false }));
    };
    
    const handlePlaying = () => {
      // The element can be resumed by paths that bypass our transport entirely
      // (lock-screen media controls, Bluetooth play button, hardware media
      // keys). Audio routes through the Web Audio graph, so a still-suspended
      // context would play SILENCE while the UI claims it's playing — always
      // un-park here. Idempotent: no-ops when the context is already running.
      resumeAudioContext();
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false, error: null }));
    };
    
    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }));
    };
    
    const handleError = () => {
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        isLoading: false,
        error: 'Stream unavailable'
      }));
      toast({
        title: 'Stream Error',
        description: 'Unable to play this station. Try another one.',
        variant: 'destructive',
      });
    };
    
    const handleWaiting = () => {
      setState(prev => ({ ...prev, isLoading: true }));
    };
    
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    
    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.pause();
      audio.src = '';
    };
  }, []);
  
  // Update volume when state changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = state.volume;
    }
  }, [state.volume]);
  
  const play = useCallback((station: RadioStation) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const streamUrl = station.url_resolved || station.url;
    
    if (!streamUrl) {
      toast({
        title: 'No Stream URL',
        description: 'This station does not have a valid stream.',
        variant: 'destructive',
      });
      return;
    }
    
    setState(prev => ({ 
      ...prev, 
      currentStation: station,
      isLoading: true,
      error: null,
    }));
    
    audio.src = streamUrl;
    audio.load();
    // Un-park a context parked by a previous pause() before audio produces sound
    // (no-op on the very first play — the context is created in setupAnalyser).
    resumeAudioContext();
    audio.play().then(() => {
      // Setup analyser after play starts (user interaction required for AudioContext)
      setupAnalyser();
    }).catch(() => {
      // Error handled by event listener
    });

    // Register click for station analytics
    registerStationClick(station.stationuuid);
  }, [setupAnalyser, resumeAudioContext]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    suspendAudioContext();
  }, [suspendAudioContext]);

  const resume = useCallback(() => {
    resumeAudioContext();
    audioRef.current?.play().catch(() => {
      // Error handled by event listener
    });
  }, [resumeAudioContext]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    suspendAudioContext();
    setState(prev => ({
      ...prev,
      currentStation: null,
      isPlaying: false,
      isLoading: false,
      error: null,
    }));
  }, [suspendAudioContext]);
  
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setState(prev => ({ ...prev, volume: clampedVolume }));
  }, []);
  
  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else if (state.currentStation) {
      resume();
    }
  }, [state.isPlaying, state.currentStation, pause, resume]);
  
  const value: RadioPlayerContextValue = {
    ...state,
    play,
    pause,
    resume,
    stop,
    setVolume,
    togglePlayPause,
    getAnalyser,
  };
  
  return (
    <RadioPlayerContext.Provider value={value}>
      {children}
    </RadioPlayerContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useRadioPlayer(): RadioPlayerContextValue {
  const context = useContext(RadioPlayerContext);
  
  if (!context) {
    throw new Error('useRadioPlayer must be used within a RadioPlayerProvider');
  }
  
  return context;
}
