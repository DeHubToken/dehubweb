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
  audioElement: HTMLAudioElement | null;
}

interface RadioPlayerContextValue extends RadioPlayerState {
  play: (station: RadioStation) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
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
    audioElement: null,
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;
    
    // Update state with audio element reference
    setState(prev => ({ ...prev, audioElement: audioRef.current }));
    
    const audio = audioRef.current;
    
    const handleCanPlay = () => {
      setState(prev => ({ ...prev, isLoading: false }));
    };
    
    const handlePlaying = () => {
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
    audio.play().catch(() => {
      // Error handled by event listener
    });
    
    // Register click for station analytics
    registerStationClick(station.stationuuid);
  }, []);
  
  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);
  
  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {
      // Error handled by event listener
    });
  }, []);
  
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setState(prev => ({ 
      ...prev, 
      currentStation: null, 
      isPlaying: false,
      isLoading: false,
      error: null,
    }));
  }, []);
  
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
