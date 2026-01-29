/**
 * Radio Mini Player Component
 * ===========================
 * Persistent floating audio player for radio streams.
 * Appears when a station is playing and stays visible while browsing.
 * 
 * @module components/app/radio/RadioMiniPlayer
 */

import { Play, Pause, X, Radio, Volume2, VolumeX, Loader2, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRadioPlayer } from '@/hooks';
import { Slider } from '@/components/ui/slider';
import { getCountryFlag } from '@/lib/api/radio-browser';
import { useState } from 'react';
import { RadioFullscreenVisualizer } from './RadioFullscreenVisualizer';

export function RadioMiniPlayer() {
  const { 
    currentStation, 
    isPlaying, 
    isLoading,
    volume, 
    togglePlayPause, 
    stop, 
    setVolume,
    getAnalyser
  } = useRadioPlayer();
  
  const [showVolume, setShowVolume] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  
  if (!currentStation) return null;
  
  const countryFlag = getCountryFlag(currentStation.countrycode);
  const isMuted = volume === 0;
  
  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed bottom-16 lg:bottom-4 left-2 right-2 sm:left-4 sm:right-4 lg:left-auto lg:right-4 lg:w-[400px] z-50',
            'bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/10',
            'rounded-2xl p-3 shadow-2xl'
          )}
        >
          <div className="flex items-center gap-3">
            {/* Station Logo */}
            <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800">
              {currentStation.favicon ? (
                <img 
                  src={currentStation.favicon} 
                  alt={currentStation.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-zinc-500" />
                </div>
              )}
              
              {/* Now Playing Animation */}
              {isPlaying && !isLoading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="flex items-end gap-0.5 h-3">
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>
            
            {/* Station Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400 uppercase tracking-wider">
                  {isLoading ? 'Connecting...' : 'Now Playing'}
                </span>
                <span className="text-sm">{countryFlag}</span>
              </div>
              <h4 className="font-semibold text-white truncate text-sm">
                {currentStation.name}
              </h4>
            </div>
            
            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setShowVolume(!showVolume)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-zinc-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-zinc-400" />
                )}
              </button>
              
              <AnimatePresence>
                {showVolume && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 80, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Slider
                      value={[volume * 100]}
                      onValueChange={([val]) => setVolume(val / 100)}
                      max={100}
                      step={1}
                      className="w-20"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Fullscreen Visualizer Button */}
            {isPlaying && (
              <button
                onClick={() => setShowVisualizer(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                title="Fullscreen visualizer"
              >
                <Maximize2 className="w-4 h-4 text-zinc-400" />
              </button>
            )}
            
            {/* Play/Pause Button */}
            <button
              onClick={togglePlayPause}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 hover:bg-zinc-200 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-black animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 text-black fill-black" />
              ) : (
                <Play className="w-5 h-5 text-black fill-black ml-0.5" />
              )}
            </button>
            
            {/* Close Button */}
            <button
              onClick={stop}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
      
      {/* Fullscreen Visualizer */}
      <RadioFullscreenVisualizer 
        isOpen={showVisualizer} 
        onClose={() => setShowVisualizer(false)}
        getAnalyser={getAnalyser}
      />
    </>
  );
}
