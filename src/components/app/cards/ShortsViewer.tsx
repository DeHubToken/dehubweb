/**
 * Shorts Viewer Component
 * =======================
 * Full-screen shorts viewer with video playback and comments overlay.
 * Desktop: Centered portrait video with side panels.
 * Mobile: Full-screen video.
 */

import { useState, useRef, useEffect } from 'react';
import { X, Heart, Share2, Send, Volume2, VolumeX, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, PanInfo } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ShortVideo } from '@/types/feed.types';

interface ShortsViewerProps {
  shorts: ShortVideo[];
  initialIndex: number;
  onClose: () => void;
}

// Mock comments data
const MOCK_COMMENTS = [
  { id: '1', username: 'viewer123', text: 'lets gooo!!', avatar: 'user1' },
  { id: '2', username: 'fan_account', text: 'Another one!', avatar: 'user2' },
  { id: '3', username: 'random_user', text: 'This is amazing content 🔥', avatar: 'user3' },
];

export function ShortsViewer({ shorts, initialIndex, onClose }: ShortsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [comment, setComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const currentShort = shorts[currentIndex];

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    setIsLiked(false);
  }, [currentIndex]);

  const goToNext = () => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Handle mouse wheel scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      if (isScrolling) return;
      
      const threshold = 50;
      if (Math.abs(e.deltaY) < threshold) return;

      setIsScrolling(true);
      
      if (e.deltaY > 0) {
        goToNext();
      } else {
        goToPrev();
      }

      // Debounce to prevent rapid scrolling
      setTimeout(() => setIsScrolling(false), 500);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [currentIndex, isScrolling]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goToNext();
      else if (e.key === 'ArrowUp' || e.key === 'k') goToPrev();
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'm') toggleMute();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y < -100) goToNext();
    else if (info.offset.y > 100) goToPrev();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
    >
      {/* Desktop Layout with Side Panels */}
      <div className={`relative flex items-center justify-center h-full ${isMobile ? 'w-full' : 'gap-4 px-4'}`}>
        
        {/* Left Side Panel - Desktop Only */}
        {!isMobile && (
          <div className="w-[300px] h-[calc(100vh-80px)] max-h-[800px] flex flex-col justify-end pb-4">
            {/* Creator Info */}
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-12 h-12 border-2 border-white/20">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentShort.username}`} />
                  <AvatarFallback>{currentShort.username[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-semibold">@{currentShort.username}</p>
                  <p className="text-white/60 text-sm">{currentShort.likes} likes</p>
                </div>
                <button className="ml-auto bg-white text-black text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors">
                  Follow
                </button>
              </div>
              {currentShort.description && (
                <p className="text-white/80 text-sm">{currentShort.description}</p>
              )}
            </div>

            {/* Comments */}
            <div className="bg-zinc-900/50 rounded-2xl p-4 max-h-[300px] overflow-y-auto scrollbar-hide">
              <p className="text-white/60 text-xs mb-3">Comments</p>
              <div className="space-y-3">
                {MOCK_COMMENTS.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <Avatar className="w-7 h-7 flex-shrink-0">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.avatar}`} />
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-medium">{c.username}</span>
                      <p className="text-white/70 text-sm">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Video Container */}
        <div className={`relative ${isMobile ? 'w-full h-full' : 'w-[360px] h-[calc(100vh-80px)] max-h-[640px]'} bg-zinc-900 rounded-none md:rounded-2xl overflow-hidden`}>
          <motion.div
            className="absolute inset-0"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            <video
              ref={videoRef}
              src={currentShort.videoUrl}
              className="w-full h-full object-cover"
              loop
              playsInline
              autoPlay
              muted={isMuted}
              poster={currentShort.thumbnail}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
          </motion.div>

          {/* Mobile-only overlays */}
          {isMobile && (
            <>
              {/* Creator Info */}
              <div className="absolute top-4 left-4 z-10">
                <div className="flex items-center gap-2 bg-zinc-800/70 backdrop-blur-sm rounded-full pl-1 pr-3 py-1">
                  <Avatar className="w-8 h-8 border border-white/20">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentShort.username}`} />
                    <AvatarFallback>{currentShort.username[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-white text-sm font-medium">@{currentShort.username}</span>
                    <span className="text-white/60 text-xs">{currentShort.likes} likes</span>
                  </div>
                  <button className="ml-2 bg-white text-black text-xs font-semibold px-3 py-1 rounded-full">
                    Follow
                  </button>
                </div>
              </div>

              {/* Comments Section */}
              <div className="absolute bottom-0 left-0 right-0 z-10 p-4 space-y-3">
                <div className="space-y-3 max-h-[150px] overflow-y-auto scrollbar-hide">
                  {MOCK_COMMENTS.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <Avatar className="w-7 h-7 flex-shrink-0">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${c.avatar}`} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">{c.username}</span>
                        <p className="text-white/80 text-sm line-clamp-2">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Add Comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full bg-zinc-800/70 backdrop-blur-sm text-white placeholder-white/40 text-sm rounded-full px-4 py-2.5 pr-10 border border-white/10 focus:outline-none focus:border-white/30"
                    />
                    {comment && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-primary">
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setIsLiked(!isLiked)}
                    className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-full flex items-center justify-center"
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
                  </button>
                  <button className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Side Panel - Desktop Only */}
        {!isMobile && (
          <div className="w-[80px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col items-center justify-center gap-6">
            {/* Navigation */}
            <button
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </button>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => setIsLiked(!isLiked)}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-colors">
                  <Heart className={`w-6 h-6 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
                </div>
                <span className="text-white text-xs">{currentShort.likes}</span>
              </button>

              <button className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-colors">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs">Share</span>
              </button>

              <button
                onClick={toggleMute}
                className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-6 h-6 text-white" />
                ) : (
                  <Volume2 className="w-6 h-6 text-white" />
                )}
              </button>
            </div>

            <button
              onClick={goToNext}
              disabled={currentIndex === shorts.length - 1}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Close button - always visible */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center z-20 transition-colors"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Mobile header controls */}
      {isMobile && (
        <button
          onClick={toggleMute}
          className="absolute top-4 right-16 w-8 h-8 bg-zinc-800/80 rounded-full flex items-center justify-center z-20"
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-white" />
          ) : (
            <Volume2 className="w-4 h-4 text-white" />
          )}
        </button>
      )}

      {/* Mobile swipe hint */}
      {isMobile && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-white/40 text-xs animate-pulse z-10">
          Swipe up for next
        </div>
      )}
    </motion.div>
  );
}
