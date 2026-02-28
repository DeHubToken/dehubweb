/**
 * Radio Mini Player Component
 * ===========================
 * Persistent floating audio player for radio streams.
 * Appears when a station is playing and stays visible while browsing.
 * 
 * @module components/app/radio/RadioMiniPlayer
 */

import { Play, Pause, X, Radio, Volume2, VolumeX, Loader2, Maximize2, Minus } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRadioPlayer } from '@/hooks';
import { Slider } from '@/components/ui/slider';
import { getCountryFlag } from '@/lib/api/radio-browser';
import { useState, useRef } from 'react';
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
  const [isMinimized, setIsMinimized] = useState(false);
  const isDragging = useRef(false);
  
  if (!currentStation) return null;
  
  const countryFlag = getCountryFlag(currentStation.countrycode);
  const isMuted = volume === 0;
  
  // Minimized view - just the station icon with play/pause
  if (isMinimized) {
    return (
      <AnimatePresence>
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.1}
          dragConstraints={{ top: -500, left: -500, right: 100, bottom: 100 }}
          onDragStart={() => { isDragging.current = true; }}
          onDragEnd={() => { setTimeout(() => { isDragging.current = false; }, 50); }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed bottom-16 right-4 z-50 cursor-grab active:cursor-grabbing',
            'md:bottom-[74px] md:right-6',
            'lg:bottom-6 lg:right-6'
          )}
        >
          <button
            onClick={() => { if (!isDragging.current) togglePlayPause(); }}
            className="relative w-14 h-14 rounded-xl overflow-hidden bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 shadow-2xl group"
          >
            {/* Station Logo */}
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
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                <Radio className="w-6 h-6 text-zinc-500" />
              </div>
            )}
            
            {/* Play/Pause Overlay */}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isLoading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 text-white fill-white" />
              ) : (
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              )}
            </div>
            
            {/* Now Playing Animation */}
            {isPlaying && !isLoading && (
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-end gap-0.5 h-2">
                <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
              </div>
            )}
          </button>
          
          {/* Expand Button */}
          <button
            onClick={() => { if (!isDragging.current) setIsMinimized(false); }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-lg bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center shadow-lg"
          >
            <Maximize2 className="w-3 h-3 text-white" />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }
  
  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed bottom-16 md:bottom-[74px] lg:bottom-4 z-50',
            // Mobile: 95% width with side margins
            'left-[2.5%] right-[2.5%]',
            // Tablet/iPad: centered with offset
            'md:left-0 md:right-[3px] md:mx-auto md:max-w-[446px]',
            // Desktop: fixed width on right side
            'lg:left-auto lg:right-4 lg:mx-0 lg:w-[400px] lg:max-w-none',
            'bg-black/30 backdrop-blur-[40px] saturate-[180%] border border-white/[0.08]',
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
            
            {/* Play/Pause Button - Liquid glass squared */}
            <button
              onClick={togglePlayPause}
              className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 text-white fill-white" />
              ) : (
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              )}
            </button>
            
            {/* Fullscreen Visualizer Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowVisualizer(true)}
                  className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Maximize2 className="w-4 h-4 text-zinc-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Fullscreen visualizer</TooltipContent>
            </Tooltip>
            
            {/* Minimize Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsMinimized(true)}
                  className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Minus className="w-4 h-4 text-zinc-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Minimize player</TooltipContent>
            </Tooltip>
            
            {/* Close Button */}
            <button
              onClick={stop}
              className="w-8 h-8 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
          
          {/* Volume bar below controls */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.06]">
            <button
              onClick={() => setVolume(isMuted ? 0.7 : 0)}
              className="flex-shrink-0"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>
            <Slider
              variant="lava"
              value={[volume * 100]}
              onValueChange={([val]) => setVolume(val / 100)}
              max={100}
              step={1}
              className="flex-1"
            />
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