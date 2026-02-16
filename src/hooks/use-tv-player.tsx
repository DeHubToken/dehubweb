/**
 * TV Player Hook
 * ==============
 * Global state management for live TV streaming playback.
 * Uses React Context to share video state across components.
 * Integrates with VideoPlaybackManager for single-stream enforcement.
 * 
 * @module hooks/use-tv-player
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
import Hls from 'hls.js';
import type { TVChannel } from '@/lib/api/live-tv';
import { toast } from '@/hooks/use-toast';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { createLogger } from '@/lib/logger';

const logger = createLogger('TVPlayer');

// ============================================================================
// TYPES
// ============================================================================

interface TVPlayerState {
  currentChannel: TVChannel | null;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  volume: number;
  error: string | null;
}

interface TVPlayerContextValue extends TVPlayerState {
  play: (channel: TVChannel) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  togglePlayPause: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const TVPlayerContext = createContext<TVPlayerContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface TVPlayerProviderProps {
  children: ReactNode;
}

const TV_PLAYER_ID = 'tv-player-global';

export function TVPlayerProvider({ children }: TVPlayerProviderProps) {
  const [state, setState] = useState<TVPlayerState>({
    currentChannel: null,
    isPlaying: false,
    isLoading: false,
    isMuted: true, // Start muted to allow autoplay
    volume: 0.8,
    error: null,
  });
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  // Register with VideoPlaybackManager
  useEffect(() => {
    videoPlaybackManager.register(TV_PLAYER_ID, () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    });
    
    return () => {
      videoPlaybackManager.unregister(TV_PLAYER_ID);
    };
  }, []);
  
  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);
  
  const setupHLSPlayback = useCallback((url: string, video: HTMLVideoElement) => {
    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    // Check if HLS.js is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      
      logger.info('HLS supported, loading source...', { url });
      hls.loadSource(url);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          logger.warn('Autoplay blocked by browser');
        });
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        logger.error('Global TV HLS Error', { type: data.type, details: data.details, fatal: data.fatal }, data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try to recover
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setState(prev => ({ 
                ...prev, 
                error: 'Stream geo-blocked or unavailable',
                isLoading: false,
                isPlaying: false,
              }));
              toast({
                title: 'Stream Error',
                description: 'Unable to play this channel. Try another one.',
                variant: 'destructive',
              });
              break;
          }
        }
      });
      
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = url;
      video.play().catch(() => {
        // Autoplay blocked
      });
    } else {
      setState(prev => ({ 
        ...prev, 
        error: 'HLS not supported',
        isLoading: false,
      }));
      toast({
        title: 'Playback Error',
        description: 'Your browser does not support HLS streaming.',
        variant: 'destructive',
      });
    }
  }, []);
  
  const play = useCallback((channel: TVChannel) => {
    const video = videoRef.current;
    if (!video) return;
    
    // Notify VideoPlaybackManager
    videoPlaybackManager.play(TV_PLAYER_ID);
    
    setState(prev => ({ 
      ...prev, 
      currentChannel: channel,
      isLoading: true,
      error: null,
    }));
    
    setupHLSPlayback(channel.streamUrl, video);
  }, [setupHLSPlayback]);
  
  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);
  
  const resume = useCallback(() => {
    videoRef.current?.play().catch(() => {
      // Error handled by event listener
    });
  }, []);
  
  const stop = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.src = '';
    }
    
    videoPlaybackManager.stop(TV_PLAYER_ID);
    
    setState(prev => ({ 
      ...prev, 
      currentChannel: null, 
      isPlaying: false,
      isLoading: false,
      error: null,
    }));
  }, []);
  
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (videoRef.current) {
      videoRef.current.volume = clampedVolume;
    }
    setState(prev => ({ ...prev, volume: clampedVolume }));
  }, []);
  
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);
  
  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else if (state.currentChannel) {
      resume();
    }
  }, [state.isPlaying, state.currentChannel, pause, resume]);
  
  // Setup video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handlePlaying = () => {
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false, error: null }));
    };
    
    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }));
    };
    
    const handleWaiting = () => {
      setState(prev => ({ ...prev, isLoading: true }));
    };
    
    const handleCanPlay = () => {
      setState(prev => ({ ...prev, isLoading: false }));
    };
    
    const handleError = () => {
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        isLoading: false,
        error: 'Stream geo-blocked or unavailable'
      }));
    };
    
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);
  
  const value: TVPlayerContextValue = {
    ...state,
    play,
    pause,
    resume,
    stop,
    setVolume,
    toggleMute,
    togglePlayPause,
    videoRef,
  };
  
  return (
    <TVPlayerContext.Provider value={value}>
      {children}
      {/* Hidden video element for playback */}
      <video
        ref={videoRef}
        muted={state.isMuted}
        playsInline
        style={{ display: 'none' }}
      />
    </TVPlayerContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useTVPlayer(): TVPlayerContextValue {
  const context = useContext(TVPlayerContext);
  
  if (!context) {
    throw new Error('useTVPlayer must be used within a TVPlayerProvider');
  }
  
  return context;
}
